import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({ rejected: z.boolean() });

/**
 * Dismiss a suggested match ("that's not my item"), or restore one that was
 * just dismissed by mistake. Writes go through the admin client because
 * matches has no client-side UPDATE policy — ownership is checked here
 * instead, against the two reports that form the pair.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: matchId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { rejected } = parsed.data;

  const admin = createAdminClient();

  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, lost_report_id, found_report_id, state")
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Either side of the pair may dismiss it — the owner saying "that's not
  // mine", or the finder saying "that's not what I found".
  const { data: reports } = await admin
    .from("reports")
    .select("id, user_id")
    .in("id", [match.lost_report_id, match.found_report_id]);

  if (!(reports ?? []).some((r) => r.user_id === user.id)) {
    return NextResponse.json({ error: "Not your match" }, { status: 403 });
  }

  // Dismissable right up until the match is settled — including mid-claim,
  // since realising "this isn't mine" part-way through verification is
  // exactly when someone reaches for this. Only a verified match is final.
  const dismissableFrom = ["suggested", "claim_requested"];
  const valid = rejected
    ? dismissableFrom.includes(match.state)
    : match.state === "rejected";

  if (!valid) {
    return NextResponse.json(
      {
        error: `Cannot ${rejected ? "dismiss" : "restore"} a match that is "${match.state}".`,
      },
      { status: 409 },
    );
  }

  const nextState = rejected ? "rejected" : "suggested";
  const { error: updateError } = await admin
    .from("matches")
    .update({ state: nextState })
    .eq("id", matchId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Dismissing mid-claim has to close the claim too, or a pending claim
  // would outlive the match it belongs to and keep its chat reachable.
  if (rejected) {
    await admin
      .from("claims")
      .update({ state: "rejected" })
      .eq("match_id", matchId)
      .eq("state", "pending");
  }

  return NextResponse.json({ state: nextState });
}
