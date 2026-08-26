import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MatchCard, { type MatchCardData } from "@/components/match/MatchCard";
import type { MatchRow, PublicReport } from "@/lib/types";
import { DEMO_MATCH } from "@/lib/demoData";

export default async function MatchesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <p className="flex-1 p-8 text-center text-sm text-neutral-500">
        Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to see matches.
      </p>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-neutral-400">Sign in to see your matches.</p>
        <Link
          href="/login"
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, lost_report_id, found_report_id, base_score, ai_confidence, ai_reasoning, matching_features, conflicting_features, state, created_at",
    )
    .order("created_at", { ascending: false })
    .returns<MatchRow[]>();

  const reportIds = Array.from(
    new Set((matches ?? []).flatMap((m) => [m.lost_report_id, m.found_report_id])),
  );

  const { data: reports } =
    reportIds.length > 0
      ? await supabase
          .from("public_reports")
          .select("*")
          .in("id", reportIds)
          .returns<PublicReport[]>()
      : { data: [] as PublicReport[] };

  const reportById = new Map((reports ?? []).map((r) => [r.id, r]));

  function toCardReport(report: PublicReport | undefined) {
    return {
      id: report?.id ?? "",
      category: report?.category ?? null,
      primary_color: report?.primary_color ?? null,
      user_description: report?.user_description ?? "",
      photoUrl: report?.photo_path
        ? supabase.storage.from("report-photos").getPublicUrl(report.photo_path).data.publicUrl
        : null,
      occurred_at: report?.occurred_at ?? new Date().toISOString(),
    };
  }

  const cards: MatchCardData[] = (matches ?? [])
    .map((m) => {
      const lost = reportById.get(m.lost_report_id);
      const found = reportById.get(m.found_report_id);
      if (!lost || !found) return null;
      return {
        id: m.id,
        ai_confidence: m.ai_confidence ?? 0,
        ai_reasoning: m.ai_reasoning ?? "",
        matching_features: m.matching_features,
        conflicting_features: m.conflicting_features,
        state: m.state,
        lost: toCardReport(lost),
        found: toCardReport(found),
        viewerIsLostOwner: lost.user_id === user.id,
      };
    })
    .filter((c): c is MatchCardData => c !== null)
    .sort((a, b) => b.ai_confidence - a.ai_confidence);

  const showDemo = process.env.DEMO_MODE === "true" && cards.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Matches</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ranked by how confident Findr is that two reports describe the same object.
        </p>
      </div>

      {showDemo && <MatchCard match={DEMO_MATCH} />}

      {cards.length === 0 && !showDemo && (
        <p className="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
          No matches yet. They&apos;ll show up here as soon as a lost and found report line up.
        </p>
      )}

      {cards.map((card) => (
        <MatchCard key={card.id} match={card} />
      ))}
    </div>
  );
}
