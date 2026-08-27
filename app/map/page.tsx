import { createClient } from "@/lib/supabase/server";
import CampusMap from "@/components/map/CampusMap";
import type { ArcEndpoints } from "@/components/map/MatchArc";
import type { PublicReport, Zone } from "@/lib/types";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const { match: matchId } = await searchParams;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-fg-muted">
        <p className="max-w-sm text-sm">
          Set <code className="text-fg">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-fg">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to load the
          campus map.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: reports }, { data: zones }] = await Promise.all([
    supabase
      .from("public_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<PublicReport[]>(),
    supabase
      .from("zones")
      .select("id, name, center_lat, center_lng, radius_m")
      .returns<Zone[]>(),
  ]);

  // ?match=<id> replays a confirmed pairing. Read through the user-scoped
  // client on purpose: `matches` RLS is participant-only, so a stranger
  // pasting someone else's match id simply gets no row — the map still
  // renders normally, just without the arc. No extra permission check needed.
  let initialArc: ArcEndpoints | null = null;
  if (matchId) {
    const { data: match } = await supabase
      .from("matches")
      .select("id, lost_report_id, found_report_id")
      .eq("id", matchId)
      .maybeSingle();

    if (match) {
      const byId = new Map((reports ?? []).map((r) => [r.id, r]));
      const lost = byId.get(match.lost_report_id);
      const found = byId.get(match.found_report_id);
      // Both endpoints must still be visible in public_reports. Once a claim
      // verifies, both reports flip to 'resolved' and drop out of the view —
      // so a replay link for a returned item degrades to a plain map rather
      // than drawing an arc to a pin that is no longer there.
      if (lost && found) {
        initialArc = {
          matchId: match.id,
          lost: { lat: lost.display_lat, lng: lost.display_lng },
          found: { lat: found.display_lat, lng: found.display_lng },
        };
      }
    }
  }

  return (
    <CampusMap initialReports={reports ?? []} zones={zones ?? []} initialArc={initialArc} />
  );
}
