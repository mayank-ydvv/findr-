import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractItemAttributes } from "@/lib/gemini";
import { embedReport } from "@/lib/voyage";
import { displayLocationFor, findZoneFor } from "@/lib/geo";
import { scanForMatches } from "@/lib/matching";
import { CAMPUS_FEED_CHANNEL, type NewReportEvent } from "@/lib/realtime";
import type { PublicReport } from "@/lib/types";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AcceptedType = (typeof ACCEPTED_TYPES)[number];

const FieldsSchema = z.object({
  kind: z.enum(["lost", "found"]),
  user_description: z.string().max(1000).default(""),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  occurred_at: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const form = await request.formData();

  const parsedFields = FieldsSchema.safeParse({
    kind: form.get("kind"),
    user_description: form.get("user_description") ?? "",
    lat: form.get("lat"),
    lng: form.get("lng"),
    occurred_at: form.get("occurred_at") ?? undefined,
  });

  if (!parsedFields.success) {
    return NextResponse.json(
      { error: "Invalid form fields", details: parsedFields.error.flatten() },
      { status: 400 },
    );
  }

  const { kind, user_description, lat, lng, occurred_at } = parsedFields.data;

  const photo = form.get("photo");
  const hasPhoto = photo instanceof File;

  // Found reports still require a photo: the finder is holding the item, and
  // report_secrets' verification questions are generated from the found
  // photo — without one there is no proof-of-ownership check to run.
  if (!hasPhoto && kind === "found") {
    return NextResponse.json(
      { error: "A photo is required when reporting an item you found." },
      { status: 400 },
    );
  }
  // A photoless lost report has nothing but its description, so that becomes
  // the required field instead — otherwise there is literally nothing to
  // embed or match on.
  if (!hasPhoto && user_description.trim().length < 10) {
    return NextResponse.json(
      {
        error:
          "Without a photo, please describe the item in a bit more detail so Findr has something to match on.",
      },
      { status: 400 },
    );
  }
  if (hasPhoto && !ACCEPTED_TYPES.includes(photo.type as AcceptedType)) {
    return NextResponse.json(
      { error: `Photo must be one of: ${ACCEPTED_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const mediaType = hasPhoto ? (photo.type as AcceptedType) : null;
  const photoBytes = hasPhoto ? Buffer.from(await photo.arrayBuffer()) : null;
  const photoBase64 = photoBytes ? photoBytes.toString("base64") : null;

  // 1. Upload photo, when there is one. Uses the user-scoped client so the
  // storage RLS policy (foldername[1] = auth.uid()) is satisfied naturally.
  let photoPath: string | null = null;
  if (photoBytes && mediaType) {
    const extension = mediaType.split("/")[1];
    photoPath = `${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("report-photos")
      .upload(photoPath, photoBytes, { contentType: mediaType });

    if (uploadError) {
      return NextResponse.json(
        { error: `Photo upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }
  }

  // 2. Extraction — attributes plus, when there's a photo, proof-of-ownership
  // questions. Falls back to the description alone for a photoless report.
  let extraction;
  try {
    extraction = await extractItemAttributes({
      imageBase64: photoBase64,
      imageMediaType: mediaType ?? undefined,
      userDescription: user_description,
      kind,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `AI attribute extraction failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // 2b. Moderation gate. Rejecting here — after the vision call that already
  // happened, but before the Voyage embedding and any DB write — means junk
  // and abuse cost one API call instead of two plus a row. The orphaned
  // upload is removed so the bucket doesn't accumulate rejected photos.
  if (!extraction.is_reportable_item) {
    if (photoPath) await supabase.storage.from("report-photos").remove([photoPath]);
    return NextResponse.json(
      {
        error:
          extraction.rejection_reason ??
          "That photo doesn't look like a lost or found item. Try a clear photo of the object itself.",
      },
      { status: 422 },
    );
  }

  // 3. Multimodal embedding — the cross-modal fingerprint used for matching.
  let embedding: number[];
  try {
    embedding = await embedReport({
      imageBase64: photoBase64,
      imageMediaType: mediaType ?? undefined,
      canonicalText: extraction.canonical_text,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Embedding failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // 4. Zone + fuzzed display location.
  const admin = createAdminClient();
  const { data: zones } = await admin
    .from("zones")
    .select("id, name, center_lat, center_lng, radius_m");
  const zone = zones ? findZoneFor(lat, lng, zones) : null;

  const reportId = crypto.randomUUID();
  const display = displayLocationFor({
    kind,
    exactLat: lat,
    exactLng: lng,
    seed: reportId,
  });

  // 5. Insert the report row as the user (RLS: user_id = auth.uid()).
  const { data: report, error: insertError } = await supabase
    .from("reports")
    .insert({
      id: reportId,
      user_id: user.id,
      kind,
      status: "open",
      photo_path: photoPath,
      user_description,
      category: extraction.category,
      primary_color: extraction.primary_color,
      secondary_colors: extraction.secondary_colors,
      brand: extraction.brand,
      distinguishing_marks: extraction.distinguishing_marks,
      visible_text: extraction.visible_text,
      condition_notes: extraction.condition_notes,
      canonical_text: extraction.canonical_text,
      zone_id: zone?.id ?? null,
      exact_lat: lat,
      exact_lng: lng,
      display_lat: display.lat,
      display_lng: display.lng,
      occurred_at: occurred_at ?? new Date().toISOString(),
      embedding,
    })
    .select(
      "id, kind, status, photo_path, user_description, category, primary_color, secondary_colors, brand, distinguishing_marks, visible_text, condition_notes, zone_id, display_lat, display_lng, occurred_at, created_at, expires_at",
    )
    .single<
      Pick<
        PublicReport,
        | "id"
        | "kind"
        | "status"
        | "photo_path"
        | "user_description"
        | "category"
        | "primary_color"
        | "secondary_colors"
        | "brand"
        | "distinguishing_marks"
        | "visible_text"
        | "condition_notes"
        | "zone_id"
        | "display_lat"
        | "display_lng"
        | "occurred_at"
        | "created_at"
        | "expires_at"
      >
    >();

  if (insertError || !report) {
    return NextResponse.json(
      { error: `Failed to save report: ${insertError?.message}` },
      { status: 500 },
    );
  }

  // 6. Verification questions go straight to the service-role-only table —
  // never touch the response the client receives.
  const { error: secretsError } = await admin.from("report_secrets").insert({
    report_id: reportId,
    verification_questions: extraction.verification_questions,
  });

  if (secretsError) {
    return NextResponse.json(
      { error: `Failed to save verification questions: ${secretsError.message}` },
      { status: 500 },
    );
  }

  // 7. Broadcast the new pin so open map tabs drop it in without a refresh.
  // Deliberately hand-picks safe fields — see lib/realtime.ts for why this
  // isn't just a Postgres Changes subscription on the reports table.
  const newReportEvent: NewReportEvent = {
    id: report.id,
    kind: report.kind,
    category: report.category,
    display_lat: report.display_lat,
    display_lng: report.display_lng,
    zone_id: report.zone_id,
    created_at: report.created_at,
  };
  const feedChannel = admin.channel(CAMPUS_FEED_CHANNEL);
  await feedChannel.httpSend("new_report", newReportEvent);
  admin.removeChannel(feedChannel);

  // 8. Scan for matches against the opposite-kind pool right away.
  let matchSummary = { candidatesConsidered: 0, matchesCreated: 0 };
  try {
    matchSummary = await scanForMatches(reportId);
  } catch (err) {
    // Report is saved either way — matching can be retried via /api/match/[id].
    console.error("scanForMatches failed after ingest:", err);
  }

  // 9. Zone insight, e.g. "High-loss area — 6 items reported here today."
  let zoneActivity: number | null = null;
  if (zone) {
    const { data } = await admin.rpc("zone_activity", { p_zone_id: zone.id, p_hours: 24 });
    zoneActivity = data ?? null;
  }

  return NextResponse.json({
    report,
    zone: zone ? { id: zone.id, name: zone.name, activity_24h: zoneActivity } : null,
    matching: matchSummary,
  });
}
