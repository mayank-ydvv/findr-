function levelFor(count: number): { label: string; className: string } {
  if (count >= 6) return { label: "🔥🔥 Very high activity", className: "border-orange-500/60 bg-orange-950/60 text-orange-200" };
  if (count >= 3) return { label: "🔥 High activity", className: "border-amber-500/60 bg-amber-950/60 text-amber-200" };
  if (count >= 1) return { label: "Some activity", className: "border-neutral-700 bg-neutral-900 text-neutral-300" };
  return { label: "Quiet so far", className: "border-neutral-800 bg-neutral-900/60 text-neutral-500" };
}

/** "High-loss area detected — 6 items reported here today." — shown after a
 * report is submitted, and usable anywhere else a zone's activity matters. */
export default function ZoneChip({ zoneName, activity24h }: { zoneName: string; activity24h: number }) {
  const { label, className } = levelFor(activity24h);

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      <span className="text-xs opacity-80">
        {activity24h} item{activity24h === 1 ? "" : "s"} reported near {zoneName} today
      </span>
    </div>
  );
}
