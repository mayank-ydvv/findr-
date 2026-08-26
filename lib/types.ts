export type ReportKind = "lost" | "found";
export type ReportStatus = "open" | "claimed" | "resolved" | "expired";
export type MatchState = "suggested" | "claim_requested" | "verified" | "rejected";
export type ClaimState = "pending" | "verified" | "rejected";

/** Controlled vocabulary Claude is asked to classify into. Keep this in sync
 * with the prompt in lib/gemini.ts — an unlisted category still gets
 * stored, but won't category-gate-match anything until added here. */
export const ITEM_CATEGORIES = [
  "earbuds",
  "headphones",
  "phone",
  "laptop",
  "tablet",
  "charger",
  "power_bank",
  "bottle",
  "wallet",
  "id_card",
  "keys",
  "backpack",
  "bag",
  "umbrella",
  "watch",
  "glasses",
  "calculator",
  "notebook",
  "jewelry",
  "clothing",
  "other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** Row shape returned by the public_reports view — no exact_lat/exact_lng. */
export interface PublicReport {
  id: string;
  user_id: string;
  kind: ReportKind;
  status: ReportStatus;
  photo_path: string;
  user_description: string;
  category: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  brand: string | null;
  distinguishing_marks: string[];
  visible_text: string | null;
  condition_notes: string | null;
  zone_id: string | null;
  display_lat: number;
  display_lng: number;
  occurred_at: string;
  created_at: string;
  expires_at: string;
}

export interface Zone {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
}

export interface MatchCandidate {
  candidate_id: string;
  base_score: number;
  vector_similarity: number;
  distance_m: number;
  hours_apart: number;
}

export interface MatchRow {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  base_score: number;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  matching_features: string[];
  conflicting_features: string[];
  state: MatchState;
  created_at: string;
}
