"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { APIProvider, Map } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { CAMPUS_MAP_STYLE } from "@/lib/mapStyle";
import { CAMPUS_FEED_CHANNEL, type MatchFoundEvent, type NewReportEvent } from "@/lib/realtime";
import type { PublicReport, Zone } from "@/lib/types";
import ReportPin, { type ReportPinData } from "./ReportPin";
import HeatLayer, { type HeatPoint } from "./HeatLayer";
import MatchArc, { type ArcEndpoints } from "./MatchArc";
import ZoneChip from "./ZoneChip";

type KindFilter = "all" | "lost" | "found";

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

/** Fallback campus bounds — replace CAMPUS_CENTER/CAMPUS_BOUNDS with your
 * real campus before the demo. Derived generously around the seeded zones
 * in supabase/seed.sql so the map has real geometry out of the box. */
const CAMPUS_CENTER = { lat: 37.4293, lng: -122.169 };
const CAMPUS_BOUNDS: google.maps.LatLngBoundsLiteral = {
  north: 37.436,
  south: 37.422,
  east: -122.16,
  west: -122.178,
};

export default function CampusMap({
  initialReports,
  zones,
}: {
  initialReports: PublicReport[];
  zones: Zone[];
}) {
  const [reports, setReports] = useState<PublicReport[]>(initialReports);
  const [newPinIds, setNewPinIds] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [selected, setSelected] = useState<PublicReport | null>(null);
  const [selectedZoneActivity, setSelectedZoneActivity] = useState<number | null>(null);
  const [arcs, setArcs] = useState<ArcEndpoints[]>([]);

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
      <div className="flex flex-1 items-center justify-center p-8 text-center text-neutral-500">
        <p className="max-w-sm text-sm">
          Set <code className="text-neutral-300">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to render
          the campus map.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="relative flex-1">
        <Map
          defaultCenter={CAMPUS_CENTER}
          defaultZoom={16}
          minZoom={14}
          restriction={{ latLngBounds: CAMPUS_BOUNDS, strictBounds: false }}
          styles={CAMPUS_MAP_STYLE}
          disableDefaultUI
          zoomControl
          gestureHandling="greedy"
          className="h-full w-full"
        >
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
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950/90 p-1 shadow-lg backdrop-blur">
            {(["all", "lost", "found"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  kindFilter === k ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"
                }`}
              >
                {k}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-neutral-800" />
            <button
              onClick={() => setHeatmapOn((v) => !v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                heatmapOn ? "bg-orange-500 text-neutral-950" : "text-neutral-400 hover:text-white"
              }`}
            >
              🔥 Heatmap
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/90 px-3 py-2 text-xs text-neutral-400 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Lost
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Found
          </div>
        </div>

        <Link
          href="/report"
          className="absolute bottom-4 right-4 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-lg hover:bg-emerald-400"
        >
          + Report an item
        </Link>

        {/* Bottom sheet */}
        {selected && (
          <div className="absolute inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-950/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-xl items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      selected.kind === "lost"
                        ? "bg-amber-950 text-amber-300"
                        : "bg-emerald-950 text-emerald-300"
                    }`}
                  >
                    {selected.kind}
                  </span>
                  <h3 className="font-medium text-white">
                    {selected.category ?? "Item"}
                    {selected.primary_color ? ` · ${selected.primary_color}` : ""}
                  </h3>
                </div>
                {selected.user_description && (
                  <p className="mt-1 max-w-md text-sm text-neutral-400">
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
                className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:text-white"
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
