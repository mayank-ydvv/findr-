export default function EvidenceList({
  matching,
  conflicting,
}: {
  matching: string[];
  conflicting: string[];
}) {
  if (matching.length === 0 && conflicting.length === 0) return null;

  return (
    <ul className="space-y-1 text-sm">
      {matching.map((feature, i) => (
        <li key={`m-${i}`} className="flex items-start gap-2 text-emerald-300">
          <span className="mt-0.5">✓</span>
          <span>{feature}</span>
        </li>
      ))}
      {conflicting.map((feature, i) => (
        <li key={`c-${i}`} className="flex items-start gap-2 text-amber-300">
          <span className="mt-0.5">!</span>
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}
