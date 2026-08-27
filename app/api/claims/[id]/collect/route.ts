import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The owner confirms they've picked the item up from the desk, which closes
 * the loop: both reports become 'resolved' and drop out of the map and the
 * matching pool.
 *
 * Only the claimant may call this. The finder saying "they collected it"
 * would be the finder marking their own homework — and the failure mode that
 * matters (item never actually reaches the owner) is exactly the one that
 * would hide behind it.
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

  const admin = createAdminClient();
  const { data: claim, error: claimError } = await admin
    .from("claims")
    .select("id, claimant_id, holder_id, state, match_id, dropped_off_at, collected_at")
    .eq("id", claimId)
    .single();

  if (claimError || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (claim.claimant_id !== user.id) {
    return NextResponse.json(
      { error: "Only the person collecting the item can confirm this." },
      { status: 403 },
    );
  }
  if (!claim.dropped_off_at) {
    return NextResponse.json(
      { error: "The finder hasn't handed this in yet." },
      { status: 409 },
    );
  }
  if (claim.collected_at) {
    return NextResponse.json({ error: "Already confirmed." }, { status: 409 });
  }

  const collectedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("claims")
    .update({ collected_at: collectedAt })
    .eq("id", claimId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Both sides of the pairing are done with: the lost report has been
  // answered and the found item has gone home. Marking them resolved is what
  // removes them from public_reports, so they stop appearing on the map and
  // stop being offered as candidates to future reports.
  const { data: match } = await admin
    .from("matches")
    .select("lost_report_id, found_report_id")
    .eq("id", claim.match_id)
    .single();

  if (match) {
    await admin
      .from("reports")
      .update({ status: "resolved" })
      .in("id", [match.lost_report_id, match.found_report_id]);
    await admin.from("matches").update({ state: "verified" }).eq("id", claim.match_id);
  }

  return NextResponse.json({ handover: { collected_at: collectedAt } });
}
