import { createClient } from "@/lib/supabase/server";
import MatchCard, { type MatchCardData } from "@/components/match/MatchCard";
import ReportsBrowser, { type BrowsableReport } from "@/components/report/ReportsBrowser";
import ChatPanel from "@/components/claim/ChatPanel";
import type { MatchRow, PublicReport, Zone } from "@/lib/types";
import { DEMO_MATCH } from "@/lib/demoData";

export default async function MatchesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <p className="flex-1 p-8 text-center text-sm text-fg-muted">
        Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to see matches.
      </p>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // proxy.ts provisions an anonymous session on every request, so this
    // means that failed rather than that the visitor needs to sign in.
    return (
      <p className="flex-1 p-8 text-center text-sm text-fg-muted">
        Couldn&apos;t start a session. If this persists, check that anonymous sign-ins are
        enabled in your Supabase project (Authentication → Sign In / Providers → Anonymous).
      </p>
    );
  }

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, lost_report_id, found_report_id, base_score, ai_confidence, ai_reasoning, matching_features, conflicting_features, state, created_at",
    )
    .neq("state", "rejected")
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

  // Separate query from the match-participant fetch above: that one is
  // scoped to ids already in a match, whereas this browses everything open.
  // Both read public_reports, so neither can expose a found item's exact
  // location.
  const [{ data: allReports }, { data: zones }] = await Promise.all([
    // Capped deliberately: the browser filters client-side, which is right at
    // campus scale, but an unbounded fetch is not. Past ~200 reports this
    // should move to a server-side ilike/full-text query instead.
    supabase
      .from("public_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<PublicReport[]>(),
    supabase.from("zones").select("id, name, center_lat, center_lng, radius_m").returns<Zone[]>(),
  ]);

  const zoneNameById = new Map((zones ?? []).map((z) => [z.id, z.name]));

  const browsable: BrowsableReport[] = (allReports ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    category: r.category,
    primary_color: r.primary_color,
    user_description: r.user_description,
    photoUrl: r.photo_path
      ? supabase.storage.from("report-photos").getPublicUrl(r.photo_path).data.publicUrl
      : null,
    zoneName: r.zone_id ? (zoneNameById.get(r.zone_id) ?? null) : null,
    occurred_at: r.occurred_at,
    isMine: r.user_id === user.id,
  }));

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      {/* Chat sits beside the matches list on wide screens and stacks
          beneath it on narrow ones — a side panel that becomes a section. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-fg">Matches</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Ranked by how confident Findr is that two reports describe the same object.
            </p>
          </div>

          {showDemo && <MatchCard match={DEMO_MATCH} />}

          {cards.length === 0 && !showDemo && (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-fg-muted">
              No matches yet. They&apos;ll show up here as soon as a lost and found report line up.
            </p>
          )}

          {cards.map((card) => (
            <MatchCard key={card.id} match={card} />
          ))}
        </div>

        <ChatPanel userId={user.id} />
      </div>

      <ReportsBrowser reports={browsable} />
    </div>
  );
}
