"use client";

import { useEffect, useRef } from "react";
import { Marker } from "@vis.gl/react-google-maps";
import type { ReportKind } from "@/lib/types";

const COLORS: Record<ReportKind, { fill: string; ring: string }> = {
  lost: { fill: "#d9a441", ring: "#7a5a1e" },
  found: { fill: "#34a86a", ring: "#1c5c3a" },
};

function pinIcon(kind: ReportKind, glyph: string): google.maps.Icon {
  const { fill, ring } = COLORS[kind];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="15" fill="${fill}" stroke="${ring}" stroke-width="2.5" />
      <text x="17" y="22" font-family="ui-sans-serif, system-ui" font-size="14" font-weight="700"
        fill="#0e1310" text-anchor="middle">${glyph}</text>
    </svg>`.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(34, 34),
    anchor: new google.maps.Point(17, 17),
  };
}

export interface ReportPinData {
  id: string;
  kind: ReportKind;
  category: string | null;
  lat: number;
  lng: number;
  /** True for the render right after a realtime "new_report" event — plays
   * the native marker drop animation once, then this should flip to false. */
  isNew?: boolean;
}

export default function ReportPin({
  pin,
  onClick,
}: {
  pin: ReportPinData;
  onClick?: (id: string) => void;
}) {
  const markerRef = useRef<google.maps.Marker | null>(null);
  const glyph = (pin.category ?? "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (pin.isNew && markerRef.current) {
      markerRef.current.setAnimation(google.maps.Animation.DROP);
    }
  }, [pin.isNew]);

  return (
    <Marker
      ref={markerRef}
      position={{ lat: pin.lat, lng: pin.lng }}
      icon={pinIcon(pin.kind, glyph)}
      title={`${pin.kind === "lost" ? "Lost" : "Found"}${pin.category ? ` · ${pin.category}` : ""}`}
      onClick={() => onClick?.(pin.id)}
    />
  );
}
