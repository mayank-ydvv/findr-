import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanForMatches } from "@/lib/matching";

/**
 * Re-runs the match scan for a report the caller owns. Ingest already fires
 * this once automatically; this exists for retrying after a transient AI
 * failure, or for re-scanning after new opposite-kind reports have arrived.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (reportError || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (report.user_id !== user.id) {
    return NextResponse.json({ error: "Not your report" }, { status: 403 });
  }

  try {
    const result = await scanForMatches(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
