import { confidenceLabel } from "@/lib/scoring";

const COLORS = {
  strong: "#34a86a",
  possible: "#d9a441",
  weak: "#6b7a73",
} as const;

export default function ConfidenceRing({ confidence }: { confidence: number }) {
  const label = confidenceLabel(confidence);
  const color = COLORS[label];
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - confidence / 100);

  return (
    <div className="relative h-16 w-16 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#262f28" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-fg">
        {confidence}%
      </div>
    </div>
  );
}
