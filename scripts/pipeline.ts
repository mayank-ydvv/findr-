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
const MODEL = "gemini-2.5-flash";

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
  imageBase64: string;
  imageMediaType: "image/jpeg" | "image/png" | "image/webp";
  userDescription: string;
  kind: "lost" | "found";
}): Promise<ItemExtraction> {
  const { imageBase64, imageMediaType, userDescription, kind } = params;

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { data: imageBase64, mimeType: imageMediaType } },
      {
        text:
          `This is a photo of a ${kind} item on a college campus. ` +
          `Reporter's own description: "${userDescription || "(none provided)"}".\n\n` +
          `Extract its attributes for a lost-and-found matching system, and write ` +
          `3 proof-of-ownership verification questions that only someone who actually ` +
          `owns (if lost) or is holding (if found) this exact item could answer correctly.`,
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
  lost: { imageUrl: string; canonicalText: string };
  found: { imageUrl: string; canonicalText: string };
}): Promise<RerankResult> {
  const { lost, found } = params;
  const [lostImage, foundImage] = await Promise.all([
    fetchImageAsBase64(lost.imageUrl),
    fetchImageAsBase64(found.imageUrl),
  ]);

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      { text: "LOST item — reported description: " + lost.canonicalText },
      { inlineData: lostImage },
      { text: "FOUND item — reported description: " + found.canonicalText },
      { inlineData: foundImage },
      {
        text:
          "Are these two reports describing the same physical object? Look past " +
          "differences in angle, lighting, and background, and call out specific " +
          "matching or conflicting visual details.",
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
