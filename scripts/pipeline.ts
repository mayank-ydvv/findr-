/**
 * Standalone copies of the Gemini/Voyage calls in lib/gemini.ts and
 * lib/voyage.ts, for use by scripts/seed-reports.ts.
 *
 * Why duplicated rather than imported: those lib files start with
 * `import "server-only"`, which is a Next.js build-time guard that throws
 * unconditionally when required outside Next's webpack graph — exactly what
 * happens when a plain tsx script imports them. Faking the guard away for
 * scripts would weaken the real protection (catching an accidental import
 * from a 'use client' component); duplicating the ~40 lines that matter is
 * the more honest trade. Keep the prompts and schemas in sync with
 * lib/gemini.ts by hand if you change the matching behavior there.
 */
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import { ITEM_CATEGORIES } from "../lib/types";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-3.6-flash"; // keep in sync with lib/gemini.ts

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
    canonical_text: { type: Type.STRING },
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

export async function extractItemAttributes(params: {
  /** Absent for a photoless lost report — the description carries it alone. */
  imageBase64?: string | null;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
  userDescription: string;
  kind: "lost" | "found";
}): Promise<ItemExtraction> {
  const { imageBase64, imageMediaType, userDescription, kind } = params;
  const hasPhoto = Boolean(imageBase64 && imageMediaType);

  const response = await client.models.generateContent({
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

  const response = await client.models.generateContent({
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
              "differences in angle, lighting, and background, and call out specific " +
              "matching or conflicting visual details."
            : "The lost report has no photo — only the description above. Judge whether " +
              "the found item pictured could be the object described, treating " +
              "unmentioned features as unknown rather than as agreement.",
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: RERANK_RESPONSE_SCHEMA,
    },
  });

  return parseJson(RerankSchema, response.text, "match rerank");
}

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/multimodalembeddings";

export async function embedReport(params: {
  imageBase64: string;
  imageMediaType: "image/jpeg" | "image/png" | "image/webp";
  canonicalText: string;
}): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: [
        {
          content: [
            { type: "text", text: params.canonicalText },
            {
              type: "image_base64",
              image_base64: `data:${params.imageMediaType};base64,${params.imageBase64}`,
            },
          ],
        },
      ],
      model: "voyage-multimodal-3",
      input_type: "document",
    }),
  });

  if (!res.ok) throw new Error(`Voyage embeddings failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const embedding = json.data[0]?.embedding;
  if (!embedding) throw new Error("Voyage response contained no embedding");
  return embedding;
}
