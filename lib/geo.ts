import type { ReportKind } from "./types";

const EARTH_RADIUS_M = 6371000;

/**
 * Deterministic jitter for a found item's public display location. Same
 * report always jitters to the same point (seeded off the report id), so
 * refreshing the map doesn't make pins swim around. Lost items are shown
 * exact — the owner has no incentive to fake their own loss location.
 */
export function displayLocationFor(params: {
  kind: ReportKind;
  exactLat: number;
  exactLng: number;
  seed: string;
  maxJitterM?: number;
}): { lat: number; lng: number } {
  const { kind, exactLat, exactLng, seed, maxJitterM = 60 } = params;

  if (kind === "lost") {
    return { lat: exactLat, lng: exactLng };
  }

  const hash = seededHash(seed);
  const angle = (hash % 1000) / 1000 * 2 * Math.PI;
  const distanceM = ((hash >>> 10) % 1000) / 1000 * maxJitterM;

  const dLat = (distanceM * Math.cos(angle)) / EARTH_RADIUS_M;
  const dLng =
    (distanceM * Math.sin(angle)) /
    (EARTH_RADIUS_M * Math.cos((exactLat * Math.PI) / 180));

  return {
    lat: exactLat + (dLat * 180) / Math.PI,
    lng: exactLng + (dLng * 180) / Math.PI,
  };
}

function seededHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(a));
}

/** Which seeded zone a lat/lng falls inside, if any — used to attach a new
 * report to a zone and to compute the "high-loss area" insight chip. */
export function findZoneFor<T extends { center_lat: number; center_lng: number; radius_m: number }>(
  lat: number,
  lng: number,
  zones: T[],
): T | null {
  for (const zone of zones) {
    if (haversineMeters(lat, lng, zone.center_lat, zone.center_lng) <= zone.radius_m) {
      return zone;
    }
  }
  return null;
}
