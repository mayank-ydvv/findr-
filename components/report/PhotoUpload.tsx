"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export default function PhotoUpload({
  onChange,
}: {
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);

  const previewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const setFile = useCallback(
    (file: File | null) => {
      onChange(file);
      setZoom(MIN_ZOOM);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        const url = file ? URL.createObjectURL(file) : null;
        previewRef.current = url;
        return url;
      });
    },
    [onChange],
  );

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) setFile(file);
        }}
        className={`flex aspect-video w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
          dragging ? "border-found bg-found-soft/20" : "border-line-strong bg-surface"
        }`}
      >
        {preview ? (
          // object-contain: always shows the whole photo (letterboxed
          // against the frame's own background when the aspect ratio
          // doesn't match a 16:9 box), rather than cropping it. `zoom`
          // scales in from that fully-visible baseline via the zoom
          // controls below — it's a preview aid only and never changes
          // what actually gets uploaded.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Item preview"
            style={{ transform: `scale(${zoom})` }}
            className="h-full w-full object-contain transition-transform duration-150"
          />
        ) : (
          <div className="text-center text-sm text-fg-muted">
            <p className="font-medium text-fg">Drop a photo here</p>
            <p className="mt-1 text-xs">or click to choose a file — JPEG, PNG, or WebP</p>
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {preview && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              className="flex h-6 w-6 items-center justify-center rounded border border-line-strong text-fg hover:border-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:border-line-strong"
            >
              −
            </button>
            <span className="w-10 text-center text-xs tabular-nums text-fg-muted">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              className="flex h-6 w-6 items-center justify-center rounded border border-line-strong text-fg hover:border-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:border-line-strong"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="text-xs text-fg-muted hover:text-fg"
          >
            Remove photo
          </button>
        </div>
      )}
    </div>
  );
}
