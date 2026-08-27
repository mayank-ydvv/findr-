import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ClaimState, MatchState, ReportKind, ReportStatus } from "@/lib/types";

/** One of the viewer's own reports, plus whatever has happened to it since. */
export interface MyReport {
  id: string;
  kind: ReportKind;
  status: ReportStatus;
  category: string | null;
  primary_color: string | null;
  user_description: string;
  photoUrl: string | null;
  zoneName: string | null;
  occurred_at: string;
  created_at: string;

  /** Live (non-rejected) matches touching this report. */
  matchCount: number;
  /** Highest AI confidence among those, 0-100. Null before stage-2 rerank. */
  topConfidence: number | null;
  /** Best match, for deep-linking to /matches. */
  topMatchId: string | null;
  /** The counterpart item's photo — what someone else reported. */
  counterpartPhotoUrl: string | null;

  /** The most advanced claim on any of this report's matches, if any. */
  claim: {
    id: string;
    state: ClaimState;
    /** True when the viewer holds the item and someone else is claiming it. */
    viewerIsHolder: boolean;
  } | null;
}

/** Verified beats pending beats rejected — a settled claim is the real story. */
const CLAIM_RANK: Record<ClaimState, number> = { verified: 2, pending: 1, rejected: 0 };

/**
 * The viewer's own reports with their current outcome.
 *
 * Runs entirely on the user-scoped client: RLS already restricts `reports` to
 * the owner, `matches` to either side's owner, and `claims` to its two
 * participants, so no service-role key is needed and none of it can leak
 * someone else's rows. The one exception is the counterpart item's photo,
 * which belongs to another user — that comes from the `public_reports` view,
 * the same safe projection the map and browser already read.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  // Deliberately the `reports` table, not `public_reports`: the view drops
  // anything past 'claimed', and your own resolved or expired report is
  // exactly the kind of thing you'd come to this tab to find.
  const { data: reports, error } = await supabase
    .from("reports")
    .select(
      "id, kind, status, category, primary_color, user_description, photo_path, zone_id, occurred_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!reports?.length) {
    return NextResponse.json({ reports: [] as MyReport[] });
  }

  const reportIds = reports.map((r) => r.id);

  const [{ data: matches }, { data: zones }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, lost_report_id, found_report_id, ai_confidence, state")
      .neq("state", "rejected")
      .or(
        `lost_report_id.in.(${reportIds.join(",")}),found_report_id.in.(${reportIds.join(",")})`,
      ),
    supabase.from("zones").select("id, name"),
  ]);

  const liveMatches = (matches ?? []) as {
    id: string;
    lost_report_id: string;
    found_report_id: string;
    ai_confidence: number | null;
    state: MatchState;
  }[];

  interface ClaimRow {
    id: string;
    match_id: string;
    claimant_id: string;
    holder_id: string;
    state: ClaimState;
  }

  // Claims hang off matches, so they're only reachable once the match ids are
  // known. Skipped entirely when nothing matched, which is the common case.
  const { data: claims } = liveMatches.length
    ? await supabase
        .from("claims")
        .select("id, match_id, claimant_id, holder_id, state")
        .in(
          "match_id",
          liveMatches.map((m) => m.id),
        )
        .returns<ClaimRow[]>()
    : { data: [] as ClaimRow[] };

  // The counterpart of each match is someone else's report, so it has to come
  // from the public view rather than the RLS-restricted table.
  const counterpartIds = Array.from(
    new Set(
      liveMatches
        .flatMap((m) => [m.lost_report_id, m.found_report_id])
        .filter((id) => !reportIds.includes(id)),
    ),
  );
  const { data: counterparts } = counterpartIds.length
    ? await supabase.from("public_reports").select("id, photo_path").in("id", counterpartIds)
    : { data: [] };

  const zoneName = new Map((zones ?? []).map((z) => [z.id, z.name]));
  const counterpartPhoto = new Map(
    (counterparts ?? []).map((c) => [c.id as string, c.photo_path as string | null]),
  );
  const claimsByMatch = new Map<string, ClaimRow[]>();
  for (const c of claims ?? []) {
    claimsByMatch.set(c.match_id, [...(claimsByMatch.get(c.match_id) ?? []), c]);
  }

  const publicUrl = (path: string | null | undefined) =>
    path ? supabase.storage.from("report-photos").getPublicUrl(path).data.publicUrl : null;

  const out: MyReport[] = reports.map((r) => {
    const mine = liveMatches
      .filter((m) => m.lost_report_id === r.id || m.found_report_id === r.id)
      // Highest confidence first; a null score sorts last rather than as zero,
      // since "not yet reranked" is not the same as "scored zero".
      .sort((a, b) => (b.ai_confidence ?? -1) - (a.ai_confidence ?? -1));

    const top = mine[0] ?? null;
    const counterpartId =
      top && (top.lost_report_id === r.id ? top.found_report_id : top.lost_report_id);

    const relevant = mine.flatMap((m) => claimsByMatch.get(m.id) ?? []);
    const claim = relevant.sort((a, b) => CLAIM_RANK[b.state] - CLAIM_RANK[a.state])[0] ?? null;

    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      category: r.category,
      primary_color: r.primary_color,
      user_description: r.user_description,
      photoUrl: publicUrl(r.photo_path),
      zoneName: r.zone_id ? (zoneName.get(r.zone_id) ?? null) : null,
      occurred_at: r.occurred_at,
      created_at: r.created_at,
      matchCount: mine.length,
      topConfidence: top?.ai_confidence ?? null,
      topMatchId: top?.id ?? null,
      counterpartPhotoUrl: counterpartId ? publicUrl(counterpartPhoto.get(counterpartId)) : null,
      claim: claim
        ? { id: claim.id, state: claim.state, viewerIsHolder: claim.holder_id === user.id }
        : null,
    };
  });

  return NextResponse.json({ reports: out });
}
