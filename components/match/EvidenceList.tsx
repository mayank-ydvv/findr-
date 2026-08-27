import { Check, TriangleAlert } from "lucide-react";

export default function EvidenceList({
  matching,
  conflicting,
}: {
  matching: string[];
  conflicting: string[];
}) {
  if (matching.length === 0 && conflicting.length === 0) return null;

  return (
    <ul className="space-y-1.5 text-sm">
      {matching.map((feature, i) => (
        <li key={`m-${i}`} className="flex items-start gap-2 text-found">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{feature}</span>
          <span className="sr-only">(matching detail)</span>
        </li>
      ))}
      {conflicting.map((feature, i) => (
        <li key={`c-${i}`} className="flex items-start gap-2 text-lost">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{feature}</span>
          <span className="sr-only">(conflicting detail)</span>
        </li>
      ))}
    </ul>
  );
}
