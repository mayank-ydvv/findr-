"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ImageOff, MapPin, Search, X } from "lucide-react";
import type { ReportKind } from "@/lib/types";

export interface BrowsableReport {
  id: string;
  kind: ReportKind;
  category: string | null;
  primary_color: string | null;
  user_description: string;
  photoUrl: string | null;
  zoneName: string | null;
  occurred_at: string;
  isMine: boolean;
}

type Filter = "all" | "lost" | "found";

function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const card: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

export default function ReportsBrowser({ reports }: { reports: BrowsableReport[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const reduced = useReducedMotion() ?? false;

  // Debounced so typing doesn't re-run the filter and restart the card
  // stagger on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const counts = useMemo(
    () => ({
      all: reports.length,
      lost: reports.filter((r) => r.kind === "lost").length,
      found: reports.filter((r) => r.kind === "found").length,
    }),
    [reports],
  );

  // Only categories actually present — offering the full ITEM_CATEGORIES
  // vocabulary would fill the dropdown with options that return nothing.
  const categories = useMemo(
    () =>
      Array.from(new Set(reports.map((r) => r.category).filter((c): c is string => Boolean(c)))).sort(),
    [reports],
  );

  const visible = useMemo(() => {
    return reports.filter((r) => {
      if (filter !== "all" && r.kind !== filter) return false;
      if (category !== "all" && r.category !== category) return false;
      if (!debouncedQuery) return true;
      // Matches only what the reporter typed and what the model extracted —
      // text baked into the photo (an engraved name, say) is not searchable.
      return [r.category, r.primary_color, r.user_description, r.zoneName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(debouncedQuery));
    });
  }, [reports, filter, category, debouncedQuery]);

  const isFiltered = filter !== "all" || category !== "all" || debouncedQuery.length > 0;

  function clearFilters() {
    setFilter("all");
    setCategory("all");
    setQuery("");
  }

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-fg">All reports</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Everything reported on campus, matched or not. Found-item pins are shown
            approximately until a claim is verified.
          </p>
        </div>

        <div
          role="group"
          aria-label="Filter reports by kind"
          className="flex items-center gap-1 rounded-full border border-line bg-surface p-1"
        >
          {(["all", "lost", "found"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${
                filter === f ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {f}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search colour, item, place…"
            aria-label="Search reports"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-8 text-sm text-fg placeholder:text-fg-subtle outline-none transition-colors duration-200 focus:border-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-fg-subtle transition-colors duration-200 hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm capitalize text-fg outline-none transition-colors duration-200 focus:border-accent"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line p-8 text-center">
          <p className="text-sm text-fg-muted">
            {reports.length === 0
              ? "Nothing has been reported yet. The first report starts the map."
              : "No reports match those filters."}
          </p>
          {reports.length > 0 && isFiltered && (
            <button
              onClick={clearFilters}
              className="mt-3 cursor-pointer text-xs font-medium text-accent-hover underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <motion.ul
          // Re-running the stagger on filter change makes the new set read as
          // a fresh result rather than items silently swapping in place.
          key={`${filter}-${category}-${debouncedQuery}`}
          variants={{ hidden: {}, show: { transition: reduced ? {} : { staggerChildren: 0.05 } } }}
          initial={reduced ? false : "hidden"}
          animate="show"
          // Thumbnail density, not a feature grid: two columns even on the
          // narrowest phone, so a card never grows to full-bleed and the
          // list stays scannable instead of becoming a photo stream.
          className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {visible.map((r) => (
            <motion.li
              key={r.id}
              variants={card}
              className="overflow-hidden rounded-xl border border-line bg-surface transition-colors duration-200 hover:border-line-strong"
            >
              <div className="relative aspect-[4/3] w-full bg-elevated">
                {r.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.photoUrl}
                    alt={`${r.kind} ${r.category ?? "item"}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                    <ImageOff className="h-6 w-6" aria-hidden />
                  </div>
                )}

                <span
                  className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur ${
                    r.kind === "lost"
                      ? "bg-lost-soft text-lost ring-1 ring-lost/40"
                      : "bg-found-soft text-found ring-1 ring-found/40"
                  }`}
                >
                  {r.kind}
                </span>

                {r.isMine && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-bg/85 px-1.5 py-0.5 text-[9px] font-medium text-fg-muted backdrop-blur">
                    Yours
                  </span>
                )}
              </div>

              <div className="p-2.5">
                <h3 className="truncate text-[13px] font-semibold capitalize tracking-tight text-fg">
                  {[r.primary_color, r.category].filter(Boolean).join(" ") || "Item"}
                </h3>
                {r.user_description && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-fg-muted">
                    {r.user_description}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-fg-subtle">
                  {r.zoneName && (
                    <>
                      <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden />
                      <span className="truncate">{r.zoneName}</span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <time dateTime={r.occurred_at} className="shrink-0">
                    {timeAgo(r.occurred_at)}
                  </time>
                </div>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
