/**
 * Scoring constants shared across the app. The actual stage-1 weighted score
 * is computed in SQL (supabase/migrations/0002_functions.sql, find_candidates)
 * so it can run over the whole table via the HNSW index — these mirror those
 * weights for anything client-side that wants to explain the number, and
 * define the stage-2 (AI rerank) threshold that turns a candidate into a
 * surfaced match.
 */
export const MATCH_WEIGHTS = {
  vectorSimilarity: 0.6,
  categoryAgreement: 0.15,
  locationProximity: 0.15,
  timeProximity: 0.1,
} as const;

export const LOCATION_DECAY_METERS = 300;
export const TIME_DECAY_HOURS = 72;
export const DIRECTIONAL_TIME_GATE_HOURS = 2;

/** Below this, a stage-2 (Claude) confidence score is not shown as a match
 * at all — it stays a discarded candidate rather than a low-confidence one. */
export const MATCH_CONFIDENCE_THRESHOLD = 60;

export function confidenceLabel(confidence: number): "strong" | "possible" | "weak" {
  if (confidence >= 85) return "strong";
  if (confidence >= MATCH_CONFIDENCE_THRESHOLD) return "possible";
  return "weak";
}
