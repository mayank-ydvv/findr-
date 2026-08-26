/**
 * Realtime pin drops and match arcs use Broadcast, not Postgres Changes.
 *
 * Postgres Changes streams the full row for every subscriber whose RLS
 * would allow a SELECT — but our reports RLS only lets owners see their own
 * rows, by design (privacy lives in the schema, see the migrations). If we
 * broadcast raw table changes instead, exact_lat/exact_lng on a found item
 * would leak to every browsing client, which is exactly what the fuzzed
 * display_lat/lng was built to prevent.
 *
 * So the server explicitly chooses what to broadcast, using the same shape
 * public_reports already exposes, over a plain public Broadcast channel.
 */
export const CAMPUS_FEED_CHANNEL = "campus-feed";

export interface NewReportEvent {
  id: string;
  kind: "lost" | "found";
  category: string | null;
  display_lat: number;
  display_lng: number;
  zone_id: string | null;
  created_at: string;
}

export interface MatchFoundEvent {
  match_id: string;
  lost_report_id: string;
  found_report_id: string;
  lost_display: { lat: number; lng: number };
  found_display: { lat: number; lng: number };
  ai_confidence: number;
}
