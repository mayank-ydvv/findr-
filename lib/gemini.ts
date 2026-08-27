import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import { ITEM_CATEGORIES } from "./types";

/** gemini-2.5-flash was retired for new API keys ("no longer available to
 * new users" — confirmed via the actual API error when this broke every
 * report submission). gemini-3.6-flash is Google's own suggested
 * replacement. Swap freely — the calling code here doesn't depend on
 * anything model-specific. */
const MODEL = "gemini-3.6-flash";

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
  /** Gate: is this actually a photo of a losable physical object? Rides on
   * the vision call that already happens, so screening costs nothing extra. */
  is_reportable_item: z.boolean(),
  rejection_reason: z.string().nullable(),
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
    is_reportable_item: { type: Type.BOOLEAN },
    rejection_reason: { type: Type.STRING, nullable: true },
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
    "is_reportable_item",
    "rejection_reason",
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
  /** Absent for a photoless lost report — the description carries it alone. */
  imageBase64?: string | null;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
  userDescription: string;
  kind: "lost" | "found";
}): Promise<ItemExtraction> {
  const { imageBase64, imageMediaType, userDescription, kind } = params;
  const hasPhoto = Boolean(imageBase64 && imageMediaType);

  const response = await client().models.generateContent({
    model: MODEL,
    contents: [
      ...(hasPhoto
        ? [{ inlineData: { data: imageBase64!, mimeType: imageMediaType! } }]
        : []),
      {
        text:
          (hasPhoto
            ? `This is a photo of a ${kind} item on a college campus. `
            : `Someone lost an item on a college campus and has no photo of it. ` +
              `Work from their description alone — infer only what it actually ` +
              `supports, and leave brand or visible_text null rather than guessing. `) +
          `Reporter's own description: "${userDescription || "(none provided)"}".\n\n` +
          (hasPhoto
            ? `First, screen the photo. Set is_reportable_item false, with a short `+
          `user-facing rejection_reason, if it is not a photograph of a physical `+
          `object someone could lose and someone else could hand back — for `+
          `example a selfie or photo centred on a person, a blank `+
          `wall or floor, or anything sexual, graphic, or targeting an individual. `+
          `When you reject, still fill the remaining fields with your best guess `+
          `so the response stays schema-valid; they will be discarded.\n\n`
            : `There is no photo to screen — set is_reportable_item true and `+
              `rejection_reason null unless the description itself is abusive `+
              `or clearly not about a lost object.\n\n`) +
          `Extract its attributes for a lost-and-found matching system, and write ` +
          `3 proof-of-ownership verification questions.\n\n` +
          `The test for a good question: could a stranger who has merely seen this ` +
          `same product model answer it? If yes, it is worthless. Ask only about ` +
          `traits unique to THIS individual unit — things that happened to it or ` +
          `were added to it after it left the factory:\n` +
          `- stickers, tags, keychains, charms, or other add-ons\n` +
          `- scratches, dents, cracks, wear patterns, discolouration\n` +
          `- handwriting, name labels, engravings, doodles\n` +
          `- what is inside it, or what was attached to it\n\n` +
          `Never ask about factory-uniform traits, which are identical across every ` +
          `unit of the model and prove nothing:\n` +
          `- the capitalisation, font, or styling of any brand name or printed text\n` +
          `- where a logo, label, or printed text sits on the body or case\n` +
          `- the item's colour, shape, material, or product category\n` +
          `- standard ports, buttons, seams, or hinges\n\n` +
          `If the photo shows no unit-specific detail worth asking about, ask about ` +
          `something only the owner would know that isn't visible at all (what was ` +
          `inside, where they last used it) rather than falling back to a ` +
          `factory-uniform trait.`,
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
  /** imageUrl is null when the owner reported the loss without a photo. */
  lost: { imageUrl: string | null; canonicalText: string };
  found: { imageUrl: string; canonicalText: string };
}): Promise<RerankResult> {
  const { lost, found } = params;
  const [lostImage, foundImage] = await Promise.all([
    lost.imageUrl ? fetchImageAsBase64(lost.imageUrl) : Promise.resolve(null),
    fetchImageAsBase64(found.imageUrl),
  ]);

  const response = await client().models.generateContent({
    model: MODEL,
    contents: [
      { text: "LOST item — reported description: " + lost.canonicalText },
      ...(lostImage ? [{ inlineData: lostImage }] : []),
      { text: "FOUND item — reported description: " + found.canonicalText },
      { inlineData: foundImage },
      {
        text:
          lostImage
            ? "Are these two reports describing the same physical object? Look past " +
              "differences in angle, lighting, and background. Call out specific matching " +
              "or conflicting visual details (stickers, scuffs, engravings, wear patterns, " +
              "hardware shape) rather than just color/category, since those were already " +
              "used to shortlist this pair."
            : "The lost report has no photo — only the description above. Judge whether " +
              "the found item in the photo could be the object described. Be more " +
              "conservative than with two photos: a description can only corroborate " +
              "details it actually mentions, so treat unmentioned features as unknown " +
              "rather than as agreement, and keep confidence lower unless the " +
              "description names something distinctive that the photo clearly shows.",
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
