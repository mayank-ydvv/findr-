"use client";

import { useEffect, useRef } from "react";
import { Polyline, useMap } from "@vis.gl/react-google-maps";

export interface ArcEndpoints {
  matchId: string;
  lost: { lat: number; lng: number };
  found: { lat: number; lng: number };
}

/**
 * The demo's visual climax: an animated dashed line connecting a lost pin to
 * its matched found pin, with the camera fitting to show both. One moving
 * arrow symbol travels the line — a classic Maps API technique (animate the
 * icon's `offset` on an interval) rather than anything CSS-driven, since the
 * line itself is a canvas/WebGL-rendered map overlay.
 */
export default function MatchArc({ arc }: { arc: ArcEndpoints }) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(arc.lost);
    bounds.extend(arc.found);
    map.fitBounds(bounds, 96);
  }, [map, arc.lost, arc.found]);

  useEffect(() => {
    const polyline = polylineRef.current;
    if (!polyline) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let offset = 0;
    const arrowIcon = {
      icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3.2, fillOpacity: 1 },
      offset: "0%",
    };
    const interval = window.setInterval(() => {
      offset = (offset + 1.5) % 100;
      const icons = polyline.get("icons") as google.maps.IconSequence[];
      icons[1] = { ...arrowIcon, offset: `${offset}%` };
      polyline.set("icons", [...icons]);
    }, 40);

    return () => window.clearInterval(interval);
  }, [arc.matchId]);

  return (
    <Polyline
      ref={polylineRef}
      path={[arc.lost, arc.found]}
      geodesic
      strokeOpacity={0}
      strokeColor="#e5ebe6"
      icons={[
        {
          icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, scale: 3 },
          offset: "0",
          repeat: "14px",
        },
        {
          icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3.2 },
          offset: "0%",
        },
      ]}
    />
  );
}
