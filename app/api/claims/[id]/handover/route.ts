import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDropoffPointId } from "@/lib/dropoffPoints";

/**
 * The finder marks a found item as handed in to the guard at one of the
 * drop-off desks.
 *
 * Only the holder may call this: the whole point of the desk is that the
 * person in possession gives the item up, so a claimant marking it handed in
 * would assert something they cannot know. Writes go through the admin
 * client because `claims` has no client-side update policy — every state
 * transition on a claim is server-mediated, same as verification.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  let body: { point?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!isDropoffPointId(body.point)) {
    return NextResponse.json({ error: "Pick one of the drop-off desks." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: claim, error: claimError } = await admin
    .from("claims")
    .select("id, holder_id, claimant_id, state, dropped_off_at, collected_at, match_id")
    .eq("id", claimId)
    .single();

  if (claimError || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (claim.holder_id !== user.id) {
    return NextResponse.json(
      { error: "Only the person holding the item can hand it in." },
      { status: 403 },
    );
  }
  if (claim.state === "rejected") {
    return NextResponse.json(
      { error: "This claim was rejected — don't hand the item over." },
      { status: 409 },
    );
  }
  if (claim.collected_at) {
    return NextResponse.json({ error: "This item has already been collected." }, { status: 409 });
  }

  // Re-marking is allowed while it's still uncollected: a finder who picked
  // the wrong desk, or physically took it to the other one, needs to be able
  // to correct it rather than leaving the owner walking to the wrong building.
  const { data: updated, error: updateError } = await admin
    .from("claims")
    .update({ dropoff_point: body.point, dropped_off_at: new Date().toISOString() })
    .eq("id", claimId)
    .select("dropoff_point, dropped_off_at, collected_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ handover: updated });
}
