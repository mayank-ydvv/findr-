"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PhotoUpload from "@/components/report/PhotoUpload";
import LocationPicker, { type LatLng } from "@/components/report/LocationPicker";
import AnalysisProgress from "@/components/report/AnalysisProgress";
import ZoneChip from "@/components/map/ZoneChip";

type Kind = "lost" | "found";

interface SubmitResult {
  report: { id: string; category: string | null; primary_color: string | null };
  zone: { id: string; name: string; activity_24h: number | null } | null;
  matching: { candidatesConsidered: number; matchesCreated: number };
}

export default function ReportPage() {
  // Static per build, not per render — safe to read directly rather than
  // mirror into state from an effect.
  const supabaseReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [checkingAuth, setCheckingAuth] = useState(supabaseReady);
  const [signedIn, setSignedIn] = useState(false);

  const [kind, setKind] = useState<Kind>("lost");
  const [photo, setPhoto] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      setCheckingAuth(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!photo) {
      setError("Add a photo of the item.");
      return;
    }
    if (!location) {
      setError("Set a location on the map.");
      return;
    }

    setSubmitting(true);
    const form = new FormData();
    form.set("kind", kind);
    form.set("user_description", description);
    form.set("lat", String(location.lat));
    form.set("lng", String(location.lng));
    form.set("photo", photo);

    try {
      const res = await fetch("/api/reports", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setResult(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAuth) return null;

  if (!supabaseReady) {
    return (
      <p className="flex-1 p-8 text-center text-sm text-neutral-500">
        Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to sign in and report items.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-neutral-400">Sign in to report a lost or found item.</p>
        <Link
          href="/login"
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 p-6">
        <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-5">
          <h2 className="text-lg font-semibold text-white">Report submitted</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Identified as{" "}
            <span className="text-neutral-200">
              {result.report.primary_color} {result.report.category}
            </span>
            .{" "}
            {result.matching.matchesCreated > 0
              ? `Found ${result.matching.matchesCreated} possible match${result.matching.matchesCreated === 1 ? "" : "es"} already — check the Matches tab.`
              : `Scanned ${result.matching.candidatesConsidered} nearby report${result.matching.candidatesConsidered === 1 ? "" : "s"}, no confident match yet. You'll see it in Matches as soon as one turns up.`}
          </p>
          {result.zone && result.zone.activity_24h !== null && (
            <div className="mt-3">
              <ZoneChip zoneName={result.zone.name} activity24h={result.zone.activity_24h} />
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Link
            href="/matches"
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
          >
            View matches
          </Link>
          <Link
            href="/"
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-lg space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Report an item</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A photo and a rough location are all Findr needs to start looking for a match.
        </p>
      </div>

      <div className="flex gap-2">
        {(["lost", "found"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold capitalize transition-colors ${
              kind === k
                ? k === "lost"
                  ? "border-amber-500 bg-amber-950/40 text-amber-300"
                  : "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                : "border-neutral-800 text-neutral-500 hover:border-neutral-600"
            }`}
          >
            I {k === "lost" ? "lost" : "found"} something
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-400">Photo</label>
        <PhotoUpload onChange={setPhoto} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-400">
          Description <span className="text-neutral-600">(optional — AI fills in the rest)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder='e.g. "black Boat earbuds case with a small sticker on the lid"'
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-400">
          Where was it {kind}?
        </label>
        <LocationPicker value={location} onChange={setLocation} />
      </div>

      {error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      <AnalysisProgress active={submitting} />

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-emerald-500 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {submitting ? "Analysing…" : "Submit report"}
      </button>
    </form>
  );
}
