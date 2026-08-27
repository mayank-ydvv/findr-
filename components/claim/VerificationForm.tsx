"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

interface PerQuestionResult {
  question: string;
  correct: boolean;
  note: string;
}

export default function VerificationForm({
  claimId,
  questions,
  onVerified,
}: {
  claimId: string;
  questions: string[];
  onVerified: (pickupLocation: { lat: number; lng: number } | null) => void;
}) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PerQuestionResult[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((question, i) => ({ question, answer: answers[i] })),
        }),
      });
      const json = await res.json();
      if (res.status === 429) {
        // Attempt ceiling reached — see MAX_VERIFICATION_ATTEMPTS. Counted
        // per (claimant, match), so opening another claim won't reset it.
        setLockedOut(true);
        setAttemptsLeft(0);
        throw new Error(json.error ?? "Too many attempts");
      }
      if (!res.ok) throw new Error(json.error ?? "Verification failed");

      setResult(json.per_question);
      if (typeof json.attempts_remaining === "number") {
        setAttemptsLeft(json.attempts_remaining);
      }
      if (json.verified) {
        onVerified(json.pickup_location ?? null);
      } else {
        setFailed(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="font-medium text-fg">Answer to verify ownership</h3>
      <p className="text-sm text-fg-muted">
        These are based on details visible only in the found item&apos;s photo.
      </p>

      {questions.map((question, i) => (
        <div key={i}>
          <label className="mb-1 block text-sm text-fg">{question}</label>
          <input
            required
            value={answers[i]}
            onChange={(e) =>
              setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))
            }
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-found"
          />
          {result && (
            <p
              className={`mt-1 flex items-start gap-1.5 text-xs ${
                result[i]?.correct ? "text-found" : "text-danger"
              }`}
            >
              {result[i]?.correct ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <X className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              )}
              <span>{result[i]?.note}</span>
            </p>
          )}
        </div>
      ))}

      {failed && !lockedOut && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          That doesn&apos;t quite match
          {attemptsLeft !== null && attemptsLeft > 0
            ? ` — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`
            : " — you can try again."}
        </p>
      )}
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={submitting || lockedOut}
        className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
      >
        {lockedOut ? "No attempts remaining" : submitting ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}
