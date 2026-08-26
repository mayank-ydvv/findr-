import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeVerificationAnswers } from "@/lib/gemini";

const BodySchema = z.object({
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).length(3),
});

/**
 * Grades the claimant's answers against report_secrets — the one place that
 * table is ever read outside the ingest route, and only via the admin
 * client. Returns pass/fail plus, on pass, the found item's exact location:
 * that's the only thing exact_lat/exact_lng ever gets revealed for.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: claimId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected exactly 3 answers" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claim, error: claimError } = await admin
    .from("claims")
    .select("id, claimant_id, state, match_id")
    .eq("id", claimId)
    .single();

  if (claimError || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (claim.claimant_id !== user.id) {
    return NextResponse.json({ error: "Not your claim" }, { status: 403 });
  }
  if (claim.state === "verified") {
    return NextResponse.json({ error: "Claim already verified" }, { status: 409 });
  }

  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("found_report_id")
    .eq("id", claim.match_id)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 500 });
  }

  const { data: secrets, error: secretsError } = await admin
    .from("report_secrets")
    .select("verification_questions")
    .eq("report_id", match.found_report_id)
    .single();

  if (secretsError || !secrets) {
    return NextResponse.json({ error: "No verification questions on file" }, { status: 500 });
  }

  const questions = secrets.verification_questions as {
    question: string;
    expected_answer: string;
  }[];

  const grading = await gradeVerificationAnswers({
    questions,
    answers: parsed.data.answers,
  });

  await admin
    .from("claims")
    .update({
      answers: parsed.data.answers,
      state: grading.all_correct ? "verified" : "rejected",
      verified_at: grading.all_correct ? new Date().toISOString() : null,
    })
    .eq("id", claimId);

  if (!grading.all_correct) {
    return NextResponse.json({ verified: false, per_question: grading.per_question });
  }

  await admin.from("matches").update({ state: "verified" }).eq("id", claim.match_id);
  await admin
    .from("reports")
    .update({ status: "resolved" })
    .in("id", [match.found_report_id]);

  const { data: foundReport } = await admin
    .from("reports")
    .select("exact_lat, exact_lng")
    .eq("id", match.found_report_id)
    .single();

  return NextResponse.json({
    verified: true,
    per_question: grading.per_question,
    pickup_location: foundReport
      ? { lat: foundReport.exact_lat, lng: foundReport.exact_lng }
      : null,
  });
}
