import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import { ITEM_CATEGORIES } from "./types";

/** gemini-2.5-flash: stable, well-established multimodal + JSON-schema
 * support. Swap to a newer flash model if you want — the calling code here
 * doesn't depend on anything model-specific. */
const MODEL = "gemini-2.5-flash";

let _client: GoogleGenAI | null = null;
/** Constructed lazily, on first real use — building it at module scope logs
 * a warning at every `next build` page-data-collection pass, since routes
 * get imported there without a real GEMINI_API_KEY in the build env. */
function client(): GoogleGenAI {
  if (!_client) _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _client;
}

function parseJson<T>(schema: z.ZodType<T>, text: string | undefined, label: string): T {
  if (!text) throw new Error(`Gemini returned no text for ${label}`);
  return schema.parse(JSON.parse(text));
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image ${url}: ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString("base64"), mimeType };
}

const ItemExtractionSchema = z.object({
  category: z.enum(ITEM_CATEGORIES),
  primary_color: z.string(),
  secondary_colors: z.array(z.string()),
  brand: z.string().nullable(),
  distinguishing_marks: z.array(z.string()),
  visible_text: z.string().nullable(),
  condition_notes: z.string(),
  canonical_text: z.string(),
  verification_questions: z
    .array(z.object({ question: z.string(), expected_answer: z.string() }))
    .length(3),
});

export type ItemExtraction = z.infer<typeof ItemExtractionSchema>;

const ITEM_EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, enum: [...ITEM_CATEGORIES] },
    primary_color: { type: Type.STRING },
    secondary_colors: { type: Type.ARRAY, items: { type: Type.STRING } },
    brand: { type: Type.STRING, nullable: true },
    distinguishing_marks: { type: Type.ARRAY, items: { type: Type.STRING } },
    visible_text: { type: Type.STRING, nullable: true },
    condition_notes: { type: Type.STRING },
    canonical_text: {
      type: Type.STRING,
      description:
        "One dense sentence describing the item, written like a search query a person would type — this is what gets embedded alongside the photo for matching.",
    },
    verification_questions: {
      type: Type.ARRAY,
      minItems: "3",
      maxItems: "3",
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          expected_answer: { type: Type.STRING },
        },
        required: ["question", "expected_answer"],
      },
    },
  },
  required: [
    "category",
    "primary_color",
    "secondary_colors",
    "brand",
    "distinguishing_marks",
    "visible_text",
    "condition_notes",
    "canonical_text",
    "verification_questions",
  ],
};

/**
 * Single vision call that does double duty: structured item attributes for
 * matching, plus proof-of-ownership questions derived from the same photo.
 */
export async function extractItemAttributes(params: {
  imageBase64: string;
  imageMediaType: "image/jpeg" | "image/png" | "image/webp";
  userDescription: string;
  kind: "lost" | "found";
}): Promise<ItemExtraction> {
  const { imageBase64, imageMediaType, userDescription, kind } = params;

  const response = await client().models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { data: imageBase64, mimeType: imageMediaType } },
      {
        text:
          `This is a photo of a ${kind} item on a college campus. ` +
          `Reporter's own description: "${userDescription || "(none provided)"}".\n\n` +
          `Extract its attributes for a lost-and-found matching system, and write ` +
          `3 proof-of-ownership verification questions that only someone who actually ` +
          `owns (if lost) or is holding (if found) this exact item could answer correctly ` +
          `— base them on specific visible details (stickers, scuffs, engravings, contents), ` +
          `never on the color/category alone since that's public information.`,
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ITEM_EXTRACTION_RESPONSE_SCHEMA,
    },
  });

  return parseJson(ItemExtractionSchema, response.text, "item extraction");
}

const RerankSchema = z.object({
  same_object: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string(),
  matching_features: z.array(z.string()),
  conflicting_features: z.array(z.string()),
});

export type RerankResult = z.infer<typeof RerankSchema>;

const RERANK_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    same_object: { type: Type.BOOLEAN },
    confidence: { type: Type.INTEGER },
    reasoning: { type: Type.STRING },
    matching_features: { type: Type.ARRAY, items: { type: Type.STRING } },
    conflicting_features: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["same_object", "confidence", "reasoning", "matching_features", "conflicting_features"],
};

/**
 * Stage-2 precision check: given one lost/found pair that already passed the
 * stage-1 vector + geo/time score, ask Gemini to actually look at both
 * photos and decide. Only ever called on the top ~5 candidates per report.
 *
 * Unlike Claude's `source: {type: "url"}`, the public Gemini API can't fetch
 * an arbitrary external image URL itself — the bytes have to be sent as
 * inlineData, so this fetches each photo first.
 */
export async function rerankMatch(params: {
  lost: { imageUrl: string; canonicalText: string };
  found: { imageUrl: string; canonicalText: string };
}): Promise<RerankResult> {
  const { lost, found } = params;
  const [lostImage, foundImage] = await Promise.all([
    fetchImageAsBase64(lost.imageUrl),
    fetchImageAsBase64(found.imageUrl),
  ]);

  const response = await client().models.generateContent({
    model: MODEL,
    contents: [
      { text: "LOST item — reported description: " + lost.canonicalText },
      { inlineData: lostImage },
      { text: "FOUND item — reported description: " + found.canonicalText },
      { inlineData: foundImage },
      {
        text:
          "Are these two reports describing the same physical object? Look past " +
          "differences in angle, lighting, and background. Call out specific matching " +
          "or conflicting visual details (stickers, scuffs, engravings, wear patterns, " +
          "hardware shape) rather than just color/category, since those were already " +
          "used to shortlist this pair.",
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: RERANK_RESPONSE_SCHEMA,
    },
  });

  return parseJson(RerankSchema, response.text, "match rerank");
}

const GradingSchema = z.object({
  all_correct: z.boolean(),
  per_question: z.array(
    z.object({ question: z.string(), correct: z.boolean(), note: z.string() }),
  ),
});

export type GradingResult = z.infer<typeof GradingSchema>;

const GRADING_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    all_correct: { type: Type.BOOLEAN },
    per_question: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          correct: { type: Type.BOOLEAN },
          note: { type: Type.STRING },
        },
        required: ["question", "correct", "note"],
      },
    },
  },
  required: ["all_correct", "per_question"],
};

/**
 * Semantic grading of a claimant's answers against the finder's expected
 * answers — "Naruto" should satisfy "the anime guy with the headband".
 * Returns pass/fail only; expected_answer text is never sent back verbatim.
 */
export async function gradeVerificationAnswers(params: {
  questions: { question: string; expected_answer: string }[];
  answers: { question: string; answer: string }[];
}): Promise<GradingResult> {
  const { questions, answers } = params;

  const response = await client().models.generateContent({
    model: MODEL,
    contents:
      "Grade whether each claimant answer semantically matches the expected answer " +
      "(paraphrases, synonyms, and partial-but-specific answers count as correct; " +
      "vague or generic answers do not).\n\n" +
      JSON.stringify(
        questions.map((q, i) => ({
          question: q.question,
          expected_answer: q.expected_answer,
          claimant_answer: answers[i]?.answer ?? "",
        })),
        null,
        2,
      ),
    config: {
      responseMimeType: "application/json",
      responseSchema: GRADING_RESPONSE_SCHEMA,
    },
  });

  return parseJson(GradingSchema, response.text, "grading");
}
