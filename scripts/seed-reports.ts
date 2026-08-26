/**
 * Seeds ~40 believable reports (build order step 9) by running real photos
 * through the actual pipeline — vision extraction, embedding, and the
 * two-stage match scan — so the map and matches page have real geometry and
 * real AI output to show, not placeholder rows.
 *
 * Setup:
 *   1. Drop real photos into scripts/seed-photos/ (jpg/png/webp).
 *   2. Copy scripts/seed-manifest.example.json to scripts/seed-manifest.json
 *      and point each entry at a photo + zone name from supabase/seed.sql.
 *   3. Run the SQL migrations and supabase/seed.sql first (zones must exist).
 *   4. npm run seed
 *
 * Uses the service-role key throughout, so it bypasses RLS by design — this
 * is a trusted local operation, not something exposed to the app itself.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extractItemAttributes, embedReport, rerankMatch } from "./pipeline";
import { displayLocationFor } from "../lib/geo";
import { MATCH_CONFIDENCE_THRESHOLD } from "../lib/scoring";
import { CAMPUS_FEED_CHANNEL, type MatchFoundEvent, type NewReportEvent } from "../lib/realtime";

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "findr-demo-2026!";

interface ManifestEntry {
  email: string;
  kind: "lost" | "found";
  photo: string;
  description: string;
  zone: string;
  minutesAgo: number;
}

function mediaTypeFor(filename: string): "image/jpeg" | "image/png" | "image/webp" {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureUser(admin: SupabaseClient<any>, email: string) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (!error) return created.user.id;

  // Already exists — look it up instead.
  let page = 1;
  while (true) {
    const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw listError;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) throw new Error(`Could not find or create user ${email}`);
    page++;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const manifestPath = join(__dirname, "seed-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      "scripts/seed-manifest.json not found — copy seed-manifest.example.json and fill it in.",
    );
  }
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const { data: zones, error: zonesError } = await admin
    .from("zones")
    .select("id, name, center_lat, center_lng, radius_m");
  if (zonesError || !zones?.length) {
    throw new Error("No zones found — run supabase/seed.sql first.");
  }

  const userIdCache = new Map<string, string>();
  const createdReportIds: string[] = [];

  for (const entry of manifest) {
    const zone = zones.find((z) => z.name === entry.zone);
    if (!zone) {
      console.warn(`Skipping "${entry.photo}" — unknown zone "${entry.zone}"`);
      continue;
    }

    const photoPath = join(__dirname, "seed-photos", entry.photo);
    if (!existsSync(photoPath)) {
      console.warn(`Skipping "${entry.photo}" — file not found in scripts/seed-photos/`);
      continue;
    }

    if (!userIdCache.has(entry.email)) {
      userIdCache.set(entry.email, await ensureUser(admin, entry.email));
    }
    const userId = userIdCache.get(entry.email)!;

    const mediaType = mediaTypeFor(entry.photo);
    const bytes = readFileSync(photoPath);
    const base64 = bytes.toString("base64");

    console.log(`Extracting attributes for ${entry.photo}…`);
    const extraction = await extractItemAttributes({
      imageBase64: base64,
      imageMediaType: mediaType,
      userDescription: entry.description,
      kind: entry.kind,
    });

    console.log(`Embedding ${entry.photo}…`);
    const embedding = await embedReport({
      imageBase64: base64,
      imageMediaType: mediaType,
      canonicalText: extraction.canonical_text,
    });

    // Jitter within the zone radius so pins don't all land on one point.
    const angle = Math.random() * 2 * Math.PI;
    const r = Math.random() * zone.radius_m * 0.7;
    const lat = zone.center_lat + (r * Math.cos(angle)) / 111_320;
    const lng =
      zone.center_lng +
      (r * Math.sin(angle)) / (111_320 * Math.cos((zone.center_lat * Math.PI) / 180));

    const reportId = crypto.randomUUID();
    const display = displayLocationFor({ kind: entry.kind, exactLat: lat, exactLng: lng, seed: reportId });
    const occurredAt = new Date(Date.now() - entry.minutesAgo * 60_000).toISOString();

    const storagePath = `${userId}/${crypto.randomUUID()}.${mediaType.split("/")[1]}`;
    const { error: uploadError } = await admin.storage
      .from("report-photos")
      .upload(storagePath, bytes, { contentType: mediaType });
    if (uploadError) throw uploadError;

    const { data: report, error: insertError } = await admin
      .from("reports")
      .insert({
        id: reportId,
        user_id: userId,
        kind: entry.kind,
        status: "open",
        photo_path: storagePath,
        user_description: entry.description,
        category: extraction.category,
        primary_color: extraction.primary_color,
        secondary_colors: extraction.secondary_colors,
        brand: extraction.brand,
        distinguishing_marks: extraction.distinguishing_marks,
        visible_text: extraction.visible_text,
        condition_notes: extraction.condition_notes,
        canonical_text: extraction.canonical_text,
        zone_id: zone.id,
        exact_lat: lat,
        exact_lng: lng,
        display_lat: display.lat,
        display_lng: display.lng,
        occurred_at: occurredAt,
        created_at: occurredAt,
        embedding,
      })
      .select("id, kind, category, display_lat, display_lng, zone_id, created_at")
      .single();
    if (insertError) throw insertError;

    await admin
      .from("report_secrets")
      .insert({ report_id: reportId, verification_questions: extraction.verification_questions });

    const feedEvent: NewReportEvent = {
      id: report.id,
      kind: report.kind,
      category: report.category,
      display_lat: report.display_lat,
      display_lng: report.display_lng,
      zone_id: report.zone_id,
      created_at: report.created_at,
    };
    const feedChannel = admin.channel(CAMPUS_FEED_CHANNEL);
    await feedChannel.httpSend("new_report", feedEvent);
    admin.removeChannel(feedChannel);

    createdReportIds.push(reportId);
    console.log(`  → ${extraction.primary_color} ${extraction.category} (${entry.kind}) in ${zone.name}`);
  }

  console.log(`\nSeeded ${createdReportIds.length} reports. Running match scan…`);

  const publicUrl = (path: string) =>
    admin.storage.from("report-photos").getPublicUrl(path).data.publicUrl;

  let matchesCreated = 0;
  for (const reportId of createdReportIds) {
    const { data: target } = await admin
      .from("reports")
      .select("id, kind, photo_path, canonical_text, display_lat, display_lng")
      .eq("id", reportId)
      .single();
    if (!target) continue;

    const { data: candidates } = await admin.rpc("find_candidates", {
      p_report_id: reportId,
      p_match_limit: 5,
    });
    if (!candidates?.length) continue;

    const { data: candidateReports } = await admin
      .from("reports")
      .select("id, kind, photo_path, canonical_text, display_lat, display_lng")
      .in(
        "id",
        candidates.map((c: { candidate_id: string }) => c.candidate_id),
      );

    for (const candidateRow of candidates as { candidate_id: string; base_score: number }[]) {
      const candidate = candidateReports?.find((r) => r.id === candidateRow.candidate_id);
      if (!candidate) continue;

      const lost = target.kind === "lost" ? target : candidate;
      const found = target.kind === "lost" ? candidate : target;

      const rerank = await rerankMatch({
        lost: { imageUrl: publicUrl(lost.photo_path), canonicalText: lost.canonical_text ?? "" },
        found: { imageUrl: publicUrl(found.photo_path), canonicalText: found.canonical_text ?? "" },
      });
      if (rerank.confidence < MATCH_CONFIDENCE_THRESHOLD) continue;

      const { data: matchRow } = await admin
        .from("matches")
        .upsert(
          {
            lost_report_id: lost.id,
            found_report_id: found.id,
            base_score: candidateRow.base_score,
            ai_confidence: rerank.confidence,
            ai_reasoning: rerank.reasoning,
            matching_features: rerank.matching_features,
            conflicting_features: rerank.conflicting_features,
            state: "suggested",
          },
          { onConflict: "lost_report_id,found_report_id" },
        )
        .select("id")
        .single();
      if (!matchRow) continue;

      matchesCreated++;
      const event: MatchFoundEvent = {
        match_id: matchRow.id,
        lost_report_id: lost.id,
        found_report_id: found.id,
        lost_display: { lat: lost.display_lat, lng: lost.display_lng },
        found_display: { lat: found.display_lat, lng: found.display_lng },
        ai_confidence: rerank.confidence,
      };
      const matchChannel = admin.channel(CAMPUS_FEED_CHANNEL);
      await matchChannel.httpSend("match_found", event);
      admin.removeChannel(matchChannel);
    }
  }

  console.log(`Created ${matchesCreated} matches.`);
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD}):`);
  for (const email of userIdCache.keys()) console.log(`  ${email}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
