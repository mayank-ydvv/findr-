"use client";

import { useState } from "react";

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
      if (!res.ok) throw new Error(json.error ?? "Verification failed");

      setResult(json.per_question);
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
      <h3 className="font-medium text-white">Answer to verify ownership</h3>
      <p className="text-sm text-neutral-500">
        These are based on details visible only in the found item&apos;s photo.
      </p>

      {questions.map((question, i) => (
        <div key={i}>
          <label className="mb-1 block text-sm text-neutral-300">{question}</label>
          <input
            required
            value={answers[i]}
            onChange={(e) =>
              setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))
            }
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
          {result && (
            <p className={`mt-1 text-xs ${result[i]?.correct ? "text-emerald-400" : "text-red-400"}`}>
              {result[i]?.correct ? "✓" : "✗"} {result[i]?.note}
            </p>
          )}
        </div>
      ))}

      {failed && (
        <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          That doesn&apos;t quite match — you can try again.
        </p>
      )}
      {error && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-emerald-500 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}
