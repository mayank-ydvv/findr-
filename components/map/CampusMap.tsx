"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { Flame, Satellite, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CAMPUS_MAP_STYLE } from "@/lib/mapStyle";
import { CAMPUS_FEED_CHANNEL, type MatchFoundEvent, type NewReportEvent } from "@/lib/realtime";
import type { PublicReport, Zone } from "@/lib/types";
import ReportPin, { type ReportPinData } from "./ReportPin";
import HeatLayer, { type HeatPoint } from "./HeatLayer";
import MatchArc, { type ArcEndpoints } from "./MatchArc";
import ZoneChip from "./ZoneChip";

type KindFilter = "all" | "lost" | "found";

/**
 * Google's own zoom control defaults to the bottom-right corner — exactly
 * where "+ Report an item" already sits, and a report pin that happens to
 * project onto either one becomes unclickable (the fixed control intercepts
 * the click before it reaches the marker underneath). Moving the zoom
 * control to the one corner nothing else occupies (top-right) removes half
 * of that collision. Must be a child of <Map> (not inlined in CampusMap's
 * own render): `google.maps.ControlPosition` only exists once the script
 * has loaded, and CampusMap renders <APIProvider> rather than living inside
 * it, so it can't safely read that value itself — see the same reasoning
 * in ReportPin/MatchArc's apiLoaded guards. */
function ZoomControlPosition() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.setOptions({ zoomControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT } });
  }, [map]);
  return null;
}

function toPin(r: PublicReport, isNew = false): ReportPinData {
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    lat: r.display_lat,
    lng: r.display_lng,
    isNew,
  };
}

function recencyWeight(createdAt: string): number {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  return Math.max(0.08, Math.exp(-hours / 48));
}

/** SRM Institute of Science and Technology, Kattankulathur campus (Potheri,
 * Chennai — 12.8252°N, 80.0476°E). Just the starting camera position — the
 * map isn't hard-restricted to this area, so it pans and zooms freely like
 * any normal Google Map. Keep this roughly in sync with the zone coordinates
 * seeded in supabase/seed.sql: a report far from every zone won't get a
 * zone-activity chip or benefit from the location-decay term in matching,
 * even though it's still fully reportable and visible on the map. */
const CAMPUS_CENTER = { lat: 12.8252, lng: 80.0476 };

export default function CampusMap({
  initialReports,
  zones,
  initialArc = null,
}: {
  initialReports: PublicReport[];
  zones: Zone[];
  /** Set when the map was opened via /map?match=<id>. Unlike a broadcast arc
   * this one is not auto-cleared — the user asked to see it, so it stays
   * until they dismiss it. */
  initialArc?: ArcEndpoints | null;
}) {
  const [reports, setReports] = useState<PublicReport[]>(initialReports);
  const [newPinIds, setNewPinIds] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [heatmapOn, setHeatmapOn] = useState(false);
  // "hybrid" (satellite imagery + road/place labels) rather than bare
  // "satellite" — a photo with no street names is hard to orient yourself
  // by on a campus map. CAMPUS_MAP_STYLE (the custom dark theme) only
  // applies to "roadmap"; Google ignores `styles` for imagery-based types,
  // which is expected, not a bug — satellite mode looks like satellite mode.
  const [mapType, setMapType] = useState<"roadmap" | "hybrid">("roadmap");
  const [selected, setSelected] = useState<PublicReport | null>(null);
  const [selectedZoneActivity, setSelectedZoneActivity] = useState<number | null>(null);
  const [arcs, setArcs] = useState<ArcEndpoints[]>(initialArc ? [initialArc] : []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(CAMPUS_FEED_CHANNEL)
      .on("broadcast", { event: "new_report" }, ({ payload }) => {
        const event = payload as NewReportEvent;
        setReports((prev) =>
          prev.some((r) => r.id === event.id)
            ? prev
            : [
                ...prev,
                {
                  id: event.id,
                  user_id: "",
                  kind: event.kind,
                  status: "open",
                  photo_path: "",
                  user_description: "",
                  category: event.category,
                  primary_color: null,
                  secondary_colors: [],
                  brand: null,
                  distinguishing_marks: [],
                  visible_text: null,
                  condition_notes: null,
                  zone_id: event.zone_id,
                  display_lat: event.display_lat,
                  display_lng: event.display_lng,
                  occurred_at: event.created_at,
                  created_at: event.created_at,
                  expires_at: "",
                },
              ],
        );
        setNewPinIds((prev) => new Set(prev).add(event.id));
        setTimeout(() => {
          setNewPinIds((prev) => {
            const next = new Set(prev);
            next.delete(event.id);
            return next;
          });
        }, 1500);
      })
      .on("broadcast", { event: "match_found" }, ({ payload }) => {
        const event = payload as MatchFoundEvent;
        const arc: ArcEndpoints = {
          matchId: event.match_id,
          lost: event.lost_display,
          found: event.found_display,
        };
        setArcs((prev) => [...prev.filter((a) => a.matchId !== arc.matchId), arc]);
        setTimeout(() => {
          setArcs((prev) => prev.filter((a) => a.matchId !== arc.matchId));
        }, 9000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const visibleReports = useMemo(
    () => (kindFilter === "all" ? reports : reports.filter((r) => r.kind === kindFilter)),
    [reports, kindFilter],
  );

  const heatPoints: HeatPoint[] = useMemo(
    () =>
      visibleReports.map((r) => ({
        lat: r.display_lat,
        lng: r.display_lng,
        weight: recencyWeight(r.created_at),
      })),
    [visibleReports],
  );

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const selectedZone = selected ? zones.find((z) => z.id === selected.zone_id) : null;

  useEffect(() => {
    // No reset-to-null branch here: the render below already gates the chip
    // on `selectedZone` being present, so a stale count from a previously
    // selected zone can't show once selectedZone clears.
    if (!selectedZone) return;
    let cancelled = false;
    const supabase = createClient();
    if (!supabase) return;
    supabase
      .rpc("zone_activity", { p_zone_id: selectedZone.id, p_hours: 24 })
      .then(({ data }) => {
        if (!cancelled) setSelectedZoneActivity(data ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedZone]);

  if (!apiKey) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-fg-muted">
        <p className="max-w-sm text-sm">
          Set <code className="text-fg">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to render
          the campus map.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="relative flex-1">
        {/* `absolute inset-0` rather than `h-full w-full`: this div's height
           comes from `flex-1` inside a flex-column ancestor, and a
           percentage-height (`h-full`) child of a flex-grow'd item is one of
           the few cases where browsers resolve it to 0 instead of the
           parent's actual size — Google Maps then measures a 0-height
           container and never requests a single tile. Absolute positioning
           against this div's `relative` resolves against its real box
           directly, sidestepping that percentage-height ambiguity. */}
        <Map
          defaultCenter={CAMPUS_CENTER}
          defaultZoom={16}
          minZoom={14}
          styles={CAMPUS_MAP_STYLE}
          mapTypeId={mapType}
          disableDefaultUI
          zoomControl
          gestureHandling="greedy"
          className="absolute inset-0"
        >
          <ZoomControlPosition />
          <HeatLayer points={heatPoints} visible={heatmapOn} />

          {visibleReports.map((r) => (
            <ReportPin
              key={r.id}
              pin={toPin(r, newPinIds.has(r.id))}
              onClick={(id) => setSelected(reports.find((rr) => rr.id === id) ?? null)}
            />
          ))}

          {arcs.map((arc) => (
            <MatchArc key={arc.matchId} arc={arc} />
          ))}
        </Map>

        {/* Filter / heatmap controls */}
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-bg/90 p-1 shadow-lg backdrop-blur">
            {(["all", "lost", "found"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                aria-pressed={kindFilter === k}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ${
                  kindFilter === k ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"
                }`}
              >
                {k}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line-strong" />
            <button
              onClick={() => setHeatmapOn((v) => !v)}
              aria-pressed={heatmapOn}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                heatmapOn ? "bg-lost text-bg" : "text-fg-muted hover:text-fg"
              }`}
            >
              <Flame className="h-3.5 w-3.5" aria-hidden />
              Heatmap
            </button>
          </div>
        </div>

        {/* Replay banner — only for an arc arriving via ?match=, since a
           broadcast arc clears itself after 9s and needs no affordance. */}
        {initialArc && arcs.some((a) => a.matchId === initialArc.matchId) && (
          <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-accent/40 bg-bg/90 py-1.5 pl-3.5 pr-1.5 shadow-lg backdrop-blur">
              <span className="text-xs font-medium text-fg">Showing this match</span>
              <button
                onClick={() => setArcs((prev) => prev.filter((a) => a.matchId !== initialArc.matchId))}
                className="cursor-pointer rounded-full p-1 text-fg-subtle transition-colors duration-200 hover:text-fg"
                aria-label="Clear match line"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {/* Map type — bottom center, clear of the legend (bottom-left) and
           the report button (bottom-right) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
          <button
            onClick={() => setMapType((v) => (v === "roadmap" ? "hybrid" : "roadmap"))}
            aria-pressed={mapType === "hybrid"}
            className={`pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition-colors duration-200 ${
              mapType === "hybrid"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-bg/90 text-fg-muted hover:text-fg"
            }`}
          >
            <Satellite className="h-3.5 w-3.5" aria-hidden />
            Satellite
          </button>
        </div>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-lg border border-line bg-bg/90 px-3 py-2 text-xs text-fg-muted backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-lost" /> Lost
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-found" /> Found
          </div>
        </div>

        <Link
          href="/report"
          className="absolute bottom-4 right-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-on-accent shadow-lg transition-colors duration-200 hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Report an item
        </Link>

        {/* Bottom sheet */}
        {selected && (
          <div className="absolute inset-x-0 bottom-0 border-t border-line bg-bg/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-xl items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      selected.kind === "lost"
                        ? "bg-lost-soft text-lost"
                        : "bg-found-soft text-found"
                    }`}
                  >
                    {selected.kind}
                  </span>
                  <h3 className="font-medium text-fg">
                    {selected.category ?? "Item"}
                    {selected.primary_color ? ` · ${selected.primary_color}` : ""}
                  </h3>
                </div>
                {selected.user_description && (
                  <p className="mt-1 max-w-md text-sm text-fg-muted">
                    {selected.user_description}
                  </p>
                )}
                {selectedZone && selectedZoneActivity !== null && (
                  <div className="mt-2">
                    <ZoneChip zoneName={selectedZone.name} activity24h={selectedZoneActivity} />
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="cursor-pointer rounded-full border border-line-strong px-2.5 py-1 text-xs text-fg-muted transition-colors duration-200 hover:text-fg"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </APIProvider>
  );
}
