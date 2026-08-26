"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";

export interface LatLng {
  lat: number;
  lng: number;
}

const DEFAULT_CENTER: LatLng = { lat: 37.4293, lng: -122.169 };

export default function LocationPicker({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (loc: LatLng) => void;
}) {
  const [center] = useState<LatLng>(value ?? DEFAULT_CENTER);

  // Prefill from browser geolocation once, if the user hasn't picked yet.
  useEffect(() => {
    if (value || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* denied or unavailable — user places the pin manually */
      },
      { timeout: 4000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <p className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-500">
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to pick a location on the map.
      </p>
    );
  }

  const pin = value ?? center;

  return (
    <div>
      <div className="h-56 w-full overflow-hidden rounded-lg border border-neutral-800">
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={center}
            defaultZoom={17}
            disableDefaultUI
            gestureHandling="greedy"
            onClick={(e) => {
              if (e.detail.latLng) onChange(e.detail.latLng);
            }}
          >
            <Marker
              position={pin}
              draggable
              onDragEnd={(e) => {
                if (e.latLng) onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
              }}
            />
          </Map>
        </APIProvider>
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">
        Tap the map or drag the pin to the exact spot.
      </p>
    </div>
  );
}
