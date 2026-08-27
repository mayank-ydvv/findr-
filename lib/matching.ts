import "server-only";
import { createAdminClient } from "./supabase/admin";
import { rerankMatch } from "./gemini";
import { MATCH_CONFIDENCE_THRESHOLD } from "./scoring";
import { CAMPUS_FEED_CHANNEL, type MatchFoundEvent } from "./realtime";
import type { MatchCandidate, ReportKind } from "./types";

interface ReportForMatching {
  id: string;
  kind: ReportKind;
  photo_path: string | null;
  user_description: string;
  canonical_text: string | null;
  display_lat: number;
  display_lng: number;
}

/**
 * Runs the full two-stage match scan for one freshly-ingested report:
 * stage 1 (SQL: HNSW recall + weighted score, see find_candidates) already
 * happened by the time this reads its results; this function does stage 2
 * (Claude rerank on the top candidates only) and persists anything that
 * clears MATCH_CONFIDENCE_THRESHOLD. Called directly (not over HTTP) from
 * both the ingest route and the seed script — an in-process call avoids a
 * self-referential fetch inside the same serverless invocation.
 */
export async function scanForMatches(reportId: string): Promise<{
  candidatesConsidered: number;
  matchesCreated: number;
}> {
  const supabase = createAdminClient();

  const { data: target, error: targetError } = await supabase
    .from("reports")
    .select("id, kind, photo_path, user_description, canonical_text, display_lat, display_lng")
    .eq("id", reportId)
    .single<ReportForMatching>();

  if (targetError || !target) {
    throw new Error(`scanForMatches: report ${reportId} not found: ${targetError?.message}`);
  }

  const { data: candidates, error: candidatesError } = await supabase.rpc(
    "find_candidates",
    { p_report_id: reportId, p_match_limit: 5 },
  );

  if (candidatesError) {
    throw new Error(`scanForMatches: find_candidates failed: ${candidatesError.message}`);
  }

  const candidateRows = (candidates ?? []) as MatchCandidate[];
  if (candidateRows.length === 0) {
    return { candidatesConsidered: 0, matchesCreated: 0 };
  }

  const candidateIds = candidateRows.map((c) => c.candidate_id);
  const { data: candidateReports, error: candidateReportsError } = await supabase
    .from("reports")
    .select(
      "id, kind, photo_path, user_description, canonical_text, display_lat, display_lng",
    )
    .in("id", candidateIds)
    .returns<ReportForMatching[]>();

  if (candidateReportsError || !candidateReports) {
    throw new Error(
      `scanForMatches: failed to load candidate reports: ${candidateReportsError?.message}`,
    );
  }

  // Pairs someone already dismissed must not come back. The upsert below
  // would otherwise reset their state to "suggested" on the next scan, so
  // they're filtered out here — which also skips paying for a rerank call
  // on a pair whose result would be discarded anyway.
  const { data: existingMatches } = await supabase
    .from("matches")
    .select("lost_report_id, found_report_id, state")
    .or(`lost_report_id.eq.${reportId},found_report_id.eq.${reportId}`);

  const rejectedPairs = new Set(
    (existingMatches ?? [])
      .filter((m) => m.state === "rejected")
      .map((m) => `${m.lost_report_id}:${m.found_report_id}`),
  );

  const publicUrl = (path: string | null) =>
    path ? supabase.storage.from("report-photos").getPublicUrl(path).data.publicUrl : null;

  let matchesCreated = 0;

  for (const candidateRow of candidateRows) {
    const candidateReport = candidateReports.find((r) => r.id === candidateRow.candidate_id);
    if (!candidateReport) continue;

    const lost = target.kind === "lost" ? target : candidateReport;
    const found = target.kind === "lost" ? candidateReport : target;

    if (rejectedPairs.has(`${lost.id}:${found.id}`)) continue;

    // The found side always has a photo (enforced at ingest and by the
    // reports_found_requires_photo constraint); the lost side may not.
    const foundImageUrl = publicUrl(found.photo_path);
    if (!foundImageUrl) continue;

    const rerank = await rerankMatch({
      lost: {
        imageUrl: publicUrl(lost.photo_path),
        canonicalText: lost.canonical_text ?? lost.user_description,
      },
      found: {
        imageUrl: foundImageUrl,
        canonicalText: found.canonical_text ?? found.user_description,
      },
    });

    if (rerank.confidence < MATCH_CONFIDENCE_THRESHOLD) continue;

    const { data: matchRow, error: upsertError } = await supabase
      .from("matches")
      .upsert(
        {
          lost_report_id: lost.id,
          found_report_id: found.id,
          base_score: candidateRow.base_score,
          ai_confidence: rerank.confidence,
          ai_reasoning: rerank.reasoning,
          matching_features: rerank.matching_features,
          conflicting_features: rerank.conflicting_features,
          state: "suggested",
        },
        { onConflict: "lost_report_id,found_report_id" },
      )
      .select("id")
      .single();

    if (upsertError) {
      throw new Error(`scanForMatches: failed to persist match: ${upsertError.message}`);
    }

    matchesCreated++;

    const event: MatchFoundEvent = {
      match_id: matchRow.id,
      lost_report_id: lost.id,
      found_report_id: found.id,
      lost_display: { lat: lost.display_lat, lng: lost.display_lng },
      found_display: { lat: found.display_lat, lng: found.display_lng },
      ai_confidence: rerank.confidence,
    };
    const matchChannel = supabase.channel(CAMPUS_FEED_CHANNEL);
    await matchChannel.httpSend("match_found", event);
    supabase.removeChannel(matchChannel);
  }

  return { candidatesConsidered: candidateRows.length, matchesCreated };
}
