import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DropoffPointId } from "@/lib/dropoffPoints";

export interface ChatThread {
  claimId: string;
  matchId: string;
  state: "pending" | "verified" | "rejected";
  /** True when the viewer is the finder holding the item. */
  viewerIsHolder: boolean;
  /** True when the viewer is the one claiming it. Both can hold at once when
   * the same person reported each side of a match. */
  viewerIsClaimant: boolean;
  handover: {
    dropoff_point: DropoffPointId | null;
    dropped_off_at: string | null;
    collected_at: string | null;
  };
  itemLabel: string;
  photoUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

/**
 * Every claim the viewer is party to, as chat threads for the matches side
 * panel. Membership is resolved from claimant_id/holder_id here rather than
 * leaning on RLS alone, because the joins below run on the admin client to
 * pull the counterpart's report details.
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

  const admin = createAdminClient();

  const { data: claims } = await admin
    .from("claims")
    .select(
      "id, match_id, claimant_id, holder_id, state, created_at, dropoff_point, dropped_off_at, collected_at",
    )
    .or(`claimant_id.eq.${user.id},holder_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (!claims?.length) return NextResponse.json({ threads: [] as ChatThread[] });

  const { data: matches } = await admin
    .from("matches")
    .select("id, lost_report_id, found_report_id")
    .in("id", Array.from(new Set(claims.map((c) => c.match_id))));

  const reportIds = Array.from(
    new Set((matches ?? []).flatMap((m) => [m.lost_report_id, m.found_report_id])),
  );
  const { data: reports } = await admin
    .from("reports")
    .select("id, category, primary_color, photo_path")
    .in("id", reportIds);

  const matchById = new Map((matches ?? []).map((m) => [m.id, m]));
  const reportById = new Map((reports ?? []).map((r) => [r.id, r]));

  // One query for every thread's latest message rather than N round-trips.
  const { data: recent } = await admin
    .from("claim_messages")
    .select("claim_id, body, created_at")
    .in("claim_id", claims.map((c) => c.id))
    .order("created_at", { ascending: false });

  const latestByClaim = new Map<string, { body: string; created_at: string }>();
  for (const m of recent ?? []) {
    if (!latestByClaim.has(m.claim_id)) {
      latestByClaim.set(m.claim_id, { body: m.body, created_at: m.created_at });
    }
  }

  const threads: ChatThread[] = claims.map((c) => {
    const match = matchById.get(c.match_id);
    // Always show the FOUND item: it's the physical object in question, and
    // it's the side guaranteed to have a photo.
    const found = match ? reportById.get(match.found_report_id) : undefined;
    const last = latestByClaim.get(c.id);

    return {
      claimId: c.id,
      matchId: c.match_id,
      state: c.state,
      viewerIsHolder: c.holder_id === user.id,
      viewerIsClaimant: c.claimant_id === user.id,
      handover: {
        dropoff_point: c.dropoff_point ?? null,
        dropped_off_at: c.dropped_off_at ?? null,
        collected_at: c.collected_at ?? null,
      },
      itemLabel:
        [found?.primary_color, found?.category].filter(Boolean).join(" ") || "Item",
      photoUrl: found?.photo_path
        ? admin.storage.from("report-photos").getPublicUrl(found.photo_path).data.publicUrl
        : null,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.created_at ?? null,
    };
  });

  // Most recently active first; threads with no messages fall back to claim order.
  threads.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return NextResponse.json({ threads });
}
