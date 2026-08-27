import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeVerificationAnswers } from "@/lib/gemini";
import { MAX_VERIFICATION_ATTEMPTS } from "@/lib/scoring";

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
    .select("lost_report_id, found_report_id")
    .eq("id", claim.match_id)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 500 });
  }

  // Attempts are counted across every claim this person has opened on this
  // match, not just the current one — see MAX_VERIFICATION_ATTEMPTS. Only
  // settled claims count as spent attempts; the row being verified right now
  // is still 'pending' and is the attempt in progress.
  const { count: spentAttempts } = await admin
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("match_id", claim.match_id)
    .eq("claimant_id", user.id)
    .eq("state", "rejected");

  if ((spentAttempts ?? 0) >= MAX_VERIFICATION_ATTEMPTS) {
    return NextResponse.json(
      {
        error: "Too many verification attempts for this item. Contact the campus desk instead.",
        attempts_remaining: 0,
      },
      { status: 429 },
    );
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
    // Hand the match back to "suggested". Without this it would sit at
    // "claim_requested" forever with its claim already rejected — a dead
    // end where the owner can neither retry the claim nor dismiss the
    // match, just a permanent "verification pending" message.
    await admin.from("matches").update({ state: "suggested" }).eq("id", claim.match_id);
    return NextResponse.json({
      verified: false,
      per_question: grading.per_question,
      // This attempt has just been spent, so subtract it from the count read
      // before grading.
      attempts_remaining: Math.max(0, MAX_VERIFICATION_ATTEMPTS - ((spentAttempts ?? 0) + 1)),
    });
  }

  await admin.from("matches").update({ state: "verified" }).eq("id", claim.match_id);

  // Both sides, not just the found item. Leaving the lost report 'open' keeps
  // it on the map as still-missing and keeps find_candidates scanning it
  // against every new found report — costing a rerank call per arrival for an
  // item that is already back with its owner.
  await admin
    .from("reports")
    .update({ status: "resolved" })
    .in("id", [match.lost_report_id, match.found_report_id]);

  // Any other pending suggestion touching either report is now moot.
  await admin
    .from("matches")
    .update({ state: "rejected" })
    .neq("id", claim.match_id)
    .in("state", ["suggested", "claim_requested"])
    .or(
      `lost_report_id.in.(${match.lost_report_id},${match.found_report_id}),` +
        `found_report_id.in.(${match.lost_report_id},${match.found_report_id})`,
    );

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
