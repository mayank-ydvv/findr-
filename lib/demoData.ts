import type { MatchCardData } from "@/components/match/MatchCard";

/**
 * DEMO_MODE stage parachute (see .env.example) — a hardcoded, clearly-labeled
 * illustrative match, shown only when DEMO_MODE=true and the signed-in user
 * has no real matches yet. Never a substitute for the live pipeline; it
 * exists so a flaky venue wifi connection doesn't sink the whole demo.
 */
export const DEMO_MATCH: MatchCardData = {
  id: "demo-match",
  ai_confidence: 91,
  ai_reasoning:
    "Same charging-case hinge shape, sticker in a matching position on the lid, and a consistent scuff pattern near the USB-C port.",
  matching_features: [
    "Hinge shape and charging-case proportions match",
    "Sticker position on the lid matches",
    "Scuff pattern near the USB-C port matches",
  ],
  conflicting_features: ["Lighting and background differ — expected across separate reports"],
  state: "suggested",
  lost: {
    id: "demo-lost",
    category: "earbuds",
    primary_color: "black",
    user_description: "Black Boat Airdopes case with a small Naruto sticker",
    photoUrl: null,
    occurred_at: new Date(Date.now() - 32 * 60_000).toISOString(),
  },
  found: {
    id: "demo-found",
    category: "earbuds",
    primary_color: "black",
    user_description: "Black wireless earbuds case, found near the library",
    photoUrl: null,
    occurred_at: new Date(Date.now() - 16 * 60_000).toISOString(),
  },
  viewerIsLostOwner: false,
  isDemo: true,
};
