/**
 * Shrinks a camera photo in the browser before it's POSTed to /api/reports.
 *
 * Vercel caps a serverless function's request body at 4.5 MB, and rejects
 * anything larger at the edge with a plain-text 413 — before the route runs,
 * so the route cannot turn it into a useful error. A modern phone camera
 * clears that cap on its own (12 MP JPEGs land around 4-6 MB, HDR/48 MP well
 * past it), which made "submit a photo from your phone" fail in production
 * while working locally, where `next dev` imposes no such limit.
 *
 * Downscaling here rather than raising a server limit is also the right call
 * on the merits: the photo's only consumers are Gemini vision and Voyage
 * embeddings, and neither resolves detail beyond ~1600px, so the extra pixels
 * cost upload time and tokens without improving a single match.
 */

/** Longest-edge cap. Comfortably above what the vision models use, and small
 * enough that even a pathological source image lands under ~1 MB. */
const MAX_EDGE = 1600;

/** Re-encode quality. 0.82 is the usual knee for photographs — visually
 * indistinguishable from 0.95 at this size, roughly half the bytes. */
const QUALITY = 0.82;

/** Files under this are already small enough to send untouched, so we skip
 * the decode/encode round trip (and any generational quality loss with it). */
const SKIP_BELOW_BYTES = 1_000_000;

/**
 * Returns a JPEG-encoded copy no larger than MAX_EDGE on its longest side.
 *
 * Falls back to the original file if anything in the canvas path fails —
 * a decode error on an exotic format, or a tainted/blocked canvas. A large
 * upload that might still succeed beats a report the user cannot file at
 * all, and the server's own size and type checks still apply either way.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (file.size < SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

    // Already within the cap: close the bitmap and keep the original bytes
    // rather than re-encoding a file that's only large because it's detailed.
    if (scale === 1 && file.size < SKIP_BELOW_BYTES * 4) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;

    // A re-encode that came out bigger (already-optimised source, or a small
    // PNG of flat colour) is not worth keeping.
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
