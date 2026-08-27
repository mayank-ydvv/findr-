import { Flame, Activity, Minus } from "lucide-react";

/** Activity level carries meaning, so it's encoded in the icon and the
 * wording as well as the colour — colour alone would leave the level
 * unreadable to anyone who can't distinguish amber from grey. */
function levelFor(count: number) {
  if (count >= 6)
    return {
      label: "Very high activity",
      Icon: Flame,
      className: "border-lost/50 bg-lost-soft text-lost",
    };
  if (count >= 3)
    return {
      label: "High activity",
      Icon: Flame,
      className: "border-lost/35 bg-lost-soft text-lost",
    };
  if (count >= 1)
    return {
      label: "Some activity",
      Icon: Activity,
      className: "border-line-strong bg-surface text-fg-muted",
    };
  return {
    label: "Quiet so far",
    Icon: Minus,
    className: "border-line bg-surface text-fg-subtle",
  };
}

/** "High-loss area detected — 6 items reported here today." — shown after a
 * report is submitted, and usable anywhere else a zone's activity matters. */
export default function ZoneChip({
  zoneName,
  activity24h,
}: {
  zoneName: string;
  activity24h: number;
}) {
  const { label, Icon, className } = levelFor(activity24h);

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border px-3 py-1.5 text-sm ${className}`}
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </span>
      <span className="text-xs opacity-80">
        {activity24h} item{activity24h === 1 ? "" : "s"} reported near {zoneName} today
      </span>
    </div>
  );
}
