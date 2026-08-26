import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicReport } from "@/lib/types";

/**
 * The one narrow, server-mediated read of report_secrets outside ingest:
 * returns the found item's verification questions (never expected_answer)
 * to the claimant so the claim page can render the form even after a page
 * reload — POST /api/claims already returns the same shape inline, but that
 * response isn't persisted anywhere the client can re-fetch it from.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: claim, error: claimError } = await admin
    .from("claims")
    .select("id, claimant_id, holder_id, state, match_id, created_at, verified_at")
    .eq("id", claimId)
    .single();

  if (claimError || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (claim.claimant_id !== user.id && claim.holder_id !== user.id) {
    return NextResponse.json({ error: "Not your claim" }, { status: 403 });
  }

  const { data: match } = await admin
    .from("matches")
    .select("lost_report_id, found_report_id")
    .eq("id", claim.match_id)
    .single();

  const [{ data: lostReport }, { data: foundReport }] = await Promise.all([
    admin
      .from("public_reports")
      .select("*")
      .eq("id", match?.lost_report_id ?? "")
      .single<PublicReport>(),
    admin
      .from("public_reports")
      .select("*")
      .eq("id", match?.found_report_id ?? "")
      .single<PublicReport>(),
  ]);

  let questions: { question: string }[] = [];
  if (claim.claimant_id === user.id && claim.state === "pending") {
    const { data: secrets } = await admin
      .from("report_secrets")
      .select("verification_questions")
      .eq("report_id", match?.found_report_id ?? "")
      .single();

    if (secrets) {
      questions = (
        secrets.verification_questions as { question: string; expected_answer: string }[]
      ).map((q) => ({ question: q.question }));
    }
  }

  return NextResponse.json({
    claim: {
      id: claim.id,
      state: claim.state,
      created_at: claim.created_at,
      verified_at: claim.verified_at,
      isClaimant: claim.claimant_id === user.id,
    },
    questions,
    lostReport,
    foundReport,
  });
}
