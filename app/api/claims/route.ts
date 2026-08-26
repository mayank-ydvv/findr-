import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({ match_id: z.string().uuid() });

/**
 * Opens a claim: the lost item's owner asserting the matched found item is
 * theirs. holder_id is derived server-side from the found report's owner —
 * never trust a client-supplied holder id. Returns the verification
 * questions (never their expected_answer) so the client can render the form.
 */
export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, lost_report_id, found_report_id, state")
    .eq("id", parsed.data.match_id)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const { data: reports, error: reportsError } = await admin
    .from("reports")
    .select("id, user_id, kind")
    .in("id", [match.lost_report_id, match.found_report_id]);

  if (reportsError || !reports || reports.length !== 2) {
    return NextResponse.json({ error: "Could not load match reports" }, { status: 500 });
  }

  const lostReport = reports.find((r) => r.id === match.lost_report_id)!;
  const foundReport = reports.find((r) => r.id === match.found_report_id)!;

  if (lostReport.user_id !== user.id) {
    return NextResponse.json(
      { error: "Only the person who reported this item lost can open a claim" },
      { status: 403 },
    );
  }

  const { data: secrets, error: secretsError } = await admin
    .from("report_secrets")
    .select("verification_questions")
    .eq("report_id", foundReport.id)
    .single();

  if (secretsError || !secrets) {
    return NextResponse.json(
      { error: "No verification questions available for this item" },
      { status: 500 },
    );
  }

  const { data: claim, error: claimError } = await admin
    .from("claims")
    .insert({
      match_id: match.id,
      claimant_id: user.id,
      holder_id: foundReport.user_id,
      state: "pending",
    })
    .select("id, state, created_at")
    .single();

  if (claimError || !claim) {
    return NextResponse.json(
      { error: `Failed to open claim: ${claimError?.message}` },
      { status: 500 },
    );
  }

  await admin.from("matches").update({ state: "claim_requested" }).eq("id", match.id);

  const questions = (
    secrets.verification_questions as { question: string; expected_answer: string }[]
  ).map((q) => ({ question: q.question }));

  return NextResponse.json({ claim, questions });
}
