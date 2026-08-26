import "server-only";

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/multimodalembeddings";
const MODEL = "voyage-multimodal-3";
export const EMBEDDING_DIMENSIONS = 1024;

type MultimodalContent =
  | { type: "text"; text: string }
  | { type: "image_base64"; image_base64: string };

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
}

async function embed(content: MultimodalContent[], inputType: "query" | "document"): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const res = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ content }],
      model: MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage embeddings request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as VoyageResponse;
  const embedding = json.data[0]?.embedding;
  if (!embedding) {
    throw new Error("Voyage response contained no embedding");
  }
  return embedding;
}

/**
 * Embed a report's photo + canonical text into the shared multimodal space.
 * Called once per report at ingest time; the result is stored on
 * reports.embedding and never recomputed. input_type "document" tells Voyage
 * this is indexed content being stored, not a search query.
 */
export async function embedReport(params: {
  imageBase64: string; // raw base64, no data: prefix
  imageMediaType: "image/jpeg" | "image/png" | "image/webp";
  canonicalText: string;
}): Promise<number[]> {
  return embed(
    [
      { type: "text", text: params.canonicalText },
      {
        type: "image_base64",
        image_base64: `data:${params.imageMediaType};base64,${params.imageBase64}`,
      },
    ],
    "document",
  );
}
