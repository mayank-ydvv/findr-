/**
 * Staffed desks where a found item is handed in, rather than passed directly
 * between two strangers.
 *
 * A direct handover asks the finder to keep the item until a meetup happens,
 * which is precisely the step that fails: the finder holds something that
 * isn't theirs for an indefinite period, and the owner has no way to tell a
 * slow reply from someone who has quietly decided to keep it. Routing every
 * handover through a desk with a guard on it removes that window — the item
 * stops being in a stranger's bag the moment it's handed in, and collection
 * becomes a normal errand at a known place rather than a negotiation.
 *
 * NOTE ON COORDINATES: these are approximate, taken from the same
 * illustrative spread as supabase/seed.sql (whose own header says the zone
 * centres are not pinned to the real buildings). They put each desk in the
 * right part of campus, not on the right doorstep. Correct them against the
 * actual buildings before anyone relies on the map pin to find a desk.
 */

export const DROPOFF_POINTS = [
  {
    id: "university_ground",
    name: "University Building",
    desk: "Ground floor desk",
    /** Who to hand it to / ask for on arrival. */
    custodian: "Security desk guard",
    lat: 12.8252,
    lng: 80.0476,
  },
  {
    id: "techpark_desk",
    name: "Tech Park",
    desk: "1st floor desk",
    custodian: "Security desk guard",
    lat: 12.827,
    lng: 80.0467,
  },
] as const;

export type DropoffPointId = (typeof DROPOFF_POINTS)[number]["id"];

export type DropoffPoint = (typeof DROPOFF_POINTS)[number];

export const DROPOFF_POINT_IDS = DROPOFF_POINTS.map((p) => p.id) as readonly DropoffPointId[];

export function isDropoffPointId(value: unknown): value is DropoffPointId {
  return typeof value === "string" && DROPOFF_POINT_IDS.includes(value as DropoffPointId);
}

export function dropoffPointById(id: string | null | undefined): DropoffPoint | null {
  if (!id) return null;
  return DROPOFF_POINTS.find((p) => p.id === id) ?? null;
}

/** "Tech Park — 1st floor desk", the label used everywhere a desk is named. */
export function dropoffLabel(point: DropoffPoint): string {
  return `${point.name} — ${point.desk}`;
}
