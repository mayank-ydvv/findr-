"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { downscaleImage } from "@/lib/downscaleImage";
import PhotoUpload from "@/components/report/PhotoUpload";
import MyReports from "@/components/report/MyReports";
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

  const [tab, setTab] = useState<"new" | "mine">("new");
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

    if (!photo && kind === "found") {
      setError("Add a photo of the item you found.");
      return;
    }
    if (!photo && description.trim().length < 10) {
      setError("Without a photo, describe the item in a bit more detail.");
      return;
    }
    if (!location) {
      setError("Set a location on the map.");
      return;
    }

    setSubmitting(true);

    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("user_description", description);
      form.set("lat", String(location.lat));
      form.set("lng", String(location.lng));
      // Shrunk in the browser: a straight-from-the-camera photo exceeds
      // Vercel's 4.5 MB request-body cap on its own. See lib/downscaleImage.
      if (photo) form.set("photo", await downscaleImage(photo));

      const res = await fetch("/api/reports", { method: "POST", body: form });

      // Not every failure comes back as JSON. A 413 is produced by Vercel's
      // edge before the route runs and its body is plain text, so parsing
      // unconditionally turns a clear "too large" into "Unexpected token 'R'".
      const raw = await res.text();
      let json: { error?: string } & Record<string, unknown>;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(
          res.status === 413
            ? "That photo is too large to upload. Try a smaller one."
            : `Upload failed (${res.status}). Please try again.`,
        );
      }

      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setResult(json as unknown as SubmitResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAuth) return null;

  if (!supabaseReady) {
    return (
      <p className="flex-1 p-8 text-center text-sm text-fg-muted">
        Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to sign in and report items.
      </p>
    );
  }

  if (!signedIn) {
    // proxy.ts provisions an anonymous session on every request, so this
    // means that failed rather than that the visitor needs to sign in.
    return (
      <p className="flex-1 p-8 text-center text-sm text-fg-muted">
        Couldn&apos;t start a session. If this persists, check that anonymous sign-ins are
        enabled in your Supabase project (Authentication → Sign In / Providers → Anonymous).
      </p>
    );
  }

  const tabs = (
    <div
      role="tablist"
      aria-label="Report sections"
      className="flex items-center gap-1 rounded-full border border-line bg-surface p-1"
    >
      {(
        [
          ["new", "Report an item"],
          ["mine", "My reports"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className={`flex-1 cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
            tab === id ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (tab === "mine") {
    return (
      <div className="mx-auto w-full max-w-lg space-y-5 p-6">
        {tabs}
        <MyReports />
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 p-6">
        {tabs}
        <div className="rounded-lg border border-found/40 bg-found-soft p-5">
          <h2 className="text-lg font-semibold text-fg">Report submitted</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Identified as{" "}
            <span className="text-fg">
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
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            View matches
          </Link>
          <Link
            href="/map"
            className="rounded-md border border-line-strong px-4 py-2 text-sm text-fg hover:border-fg-subtle"
          >
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-lg space-y-5 p-6">
      {tabs}

      <div>
        <h1 className="text-xl font-semibold text-fg">Report an item</h1>
        <p className="mt-1 text-sm text-fg-muted">
          A rough location and either a photo or a description are all Findr needs to
          start looking for a match.
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
                  ? "border-lost bg-lost-soft text-lost"
                  : "border-found bg-found-soft text-found"
                : "border-line text-fg-muted hover:border-fg-subtle"
            }`}
          >
            I {k === "lost" ? "lost" : "found"} something
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-fg-muted">
          Photo{" "}
          {kind === "lost" ? (
            <span className="text-fg-subtle">(optional — describe it instead if you have none)</span>
          ) : (
            <span className="text-fg-subtle">(required)</span>
          )}
        </label>
        <PhotoUpload onChange={setPhoto} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-fg-muted">
          Description{" "}
          <span className="text-fg-subtle">
            {!photo && kind === "lost"
              ? "(required — it's all Findr has to match on)"
              : "(optional — AI fills in the rest)"}
          </span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder='e.g. "black Boat earbuds case with a small sticker on the lid"'
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-fg-muted">
          Where was it {kind}?
        </label>
        <LocationPicker value={location} onChange={setLocation} />
      </div>

      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <AnalysisProgress active={submitting} />

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Analysing…" : "Submit report"}
      </button>
    </form>
  );
}
