"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";

export interface HeatPoint {
  lat: number;
  lng: number;
  /** Recency weight, 0-1 — a report from an hour ago outweighs one from
   * three weeks ago, so the heatmap reflects what's active now. */
  weight: number;
}

/**
 * Google removed google.maps.visualization.HeatmapLayer from the Maps
 * JavaScript API (deprecated May 2025, gone as of v3.65) — their own
 * migration note points to deck.gl, which is a heavy dependency for what
 * this app needs. A canvas OverlayView gives full control over the exact
 * amber/orange gradient the campus map style calls for, with no extra
 * dependency: Maps calls draw() automatically on every pan/zoom, so this
 * only has to re-render its own canvas, not manage viewport math by hand
 * beyond what OverlayView already hands it.
 */
class CanvasHeatmapOverlay extends google.maps.OverlayView {
  private readonly canvas = document.createElement("canvas");
  private points: HeatPoint[] = [];

  constructor() {
    super();
    Object.assign(this.canvas.style, {
      position: "absolute",
      pointerEvents: "none",
    });
  }

  setPoints(points: HeatPoint[]) {
    this.points = points;
    this.draw();
  }

  override onAdd() {
    this.getPanes()?.overlayLayer.appendChild(this.canvas);
  }

  override onRemove() {
    this.canvas.remove();
  }

  override draw() {
    const projection = this.getProjection();
    const map = this.getMap();
    const bounds = map && "getBounds" in map ? (map as google.maps.Map).getBounds() : null;
    if (!projection || !bounds) return;

    const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
    const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
    if (!ne || !sw) return;

    const left = Math.min(ne.x, sw.x);
    const top = Math.min(ne.y, sw.y);
    const width = Math.max(1, Math.abs(ne.x - sw.x));
    const height = Math.max(1, Math.abs(ne.y - sw.y));

    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.left = `${left}px`;
    this.canvas.style.top = `${top}px`;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    for (const point of this.points) {
      const px = projection.fromLatLngToDivPixel(new google.maps.LatLng(point.lat, point.lng));
      if (!px) continue;
      const x = px.x - left;
      const y = px.y - top;
      const radius = 46;
      const alpha = Math.min(0.55, 0.18 + point.weight * 0.5);

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(217, 164, 65, ${alpha})`);
      gradient.addColorStop(0.55, `rgba(214, 92, 43, ${alpha * 0.5})`);
      gradient.addColorStop(1, "rgba(214, 92, 43, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Must render as a child of <Map> so useMap() resolves to the map instance. */
export default function HeatLayer({ points, visible }: { points: HeatPoint[]; visible: boolean }) {
  const map = useMap();
  const overlayRef = useRef<CanvasHeatmapOverlay | null>(null);

  useEffect(() => {
    if (!map) return;
    const overlay = new CanvasHeatmapOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;
    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    overlayRef.current?.setMap(visible ? map : null);
    if (visible) overlayRef.current?.setPoints(points);
  }, [points, visible, map]);

  return null;
}
