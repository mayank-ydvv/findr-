"use client";

import { useCallback, useState } from "react";

export default function PhotoUpload({
  onChange,
}: {
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const setFile = useCallback(
    (file: File | null) => {
      onChange(file);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file ? URL.createObjectURL(file) : null;
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
          dragging ? "border-emerald-500 bg-emerald-950/20" : "border-neutral-700 bg-neutral-900"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Item preview" className="h-full w-full object-cover" />
        ) : (
          <div className="text-center text-sm text-neutral-500">
            <p className="font-medium text-neutral-300">Drop a photo here</p>
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
        <button
          type="button"
          onClick={() => setFile(null)}
          className="mt-2 text-xs text-neutral-500 hover:text-neutral-300"
        >
          Remove photo
        </button>
      )}
    </div>
  );
}
