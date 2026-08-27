"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

export default function CallToAction() {
  const reduced = useReducedMotion() ?? false;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:pb-28">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-line bg-surface px-6 py-12 text-center sm:px-12 sm:py-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 70% at 50% 0%, rgba(37,99,235,0.18), transparent 70%)",
          }}
        />
        <div className="relative">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            It takes one photo
          </h2>
          <p className="mx-auto mt-3 max-w-md text-fg-muted">
            Whether you lost it or found it, the report is the same: a picture and a
            rough spot on the map. Findr handles the rest.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/report"
              className="group inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-on-accent transition-colors duration-200 hover:bg-accent-hover"
            >
              Report an item
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/matches"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-5 py-3 text-sm font-semibold text-fg transition-colors duration-200 hover:border-fg-subtle hover:bg-elevated"
            >
              See your matches
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
