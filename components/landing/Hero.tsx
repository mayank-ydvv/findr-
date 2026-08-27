"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowRight, MapPin } from "lucide-react";
import HeroMapVisual from "./HeroMapVisual";

/** One shared rise-and-fade, staggered by the parent. Kept as a single
 * variant so every element in the hero enters on the same curve — mixing
 * per-element easings is what makes a staggered entrance feel unrelated. */
const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export default function Hero() {
  const reduced = useReducedMotion() ?? false;

  const container: Variants = {
    hidden: {},
    show: {
      transition: reduced ? {} : { staggerChildren: 0.09, delayChildren: 0.05 },
    },
  };

  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* Ambient wash — pure decoration, so it stays out of the a11y tree. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 55% at 18% 8%, rgba(37,99,235,0.16), transparent 60%), radial-gradient(45% 45% at 92% 90%, rgba(16,185,129,0.10), transparent 65%)",
        }}
      />

      <motion.div
        variants={container}
        initial={reduced ? false : "hidden"}
        animate="show"
        className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16"
      >
        <div>
          <motion.div variants={rise}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
              <MapPin className="h-3.5 w-3.5 text-accent-hover" aria-hidden />
              SRM Kattankulathur
            </span>
          </motion.div>

          <motion.h1
            variants={rise}
            className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-6xl"
          >
            Lost something?
            <br />
            <span className="text-fg-muted">Findr is already</span>{" "}
            <span className="text-accent-hover">looking for it.</span>
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-5 max-w-lg text-base leading-relaxed text-fg-muted sm:text-lg"
          >
            Post a photo of what you lost — or what you found. Findr turns every report
            into an AI fingerprint and scans the whole campus for the other half of the
            pair, so you never have to scroll another group chat.
          </motion.p>

          <motion.div variants={rise} className="mt-8 flex flex-wrap items-center gap-3">
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
              href="/map"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-5 py-3 text-sm font-semibold text-fg transition-colors duration-200 hover:border-fg-subtle hover:bg-surface"
            >
              Open the live map
            </Link>
          </motion.div>

          <motion.dl
            variants={rise}
            className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-line pt-6"
          >
            {[
              { k: "Photo + text", v: "matched together" },
              { k: "~9s", v: "report to match" },
              { k: "Verified", v: "before pickup" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-sm font-semibold tracking-tight text-fg">{s.k}</dt>
                <dd className="text-xs text-fg-subtle">{s.v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div variants={rise} className="lg:pl-4">
          <HeroMapVisual />
        </motion.div>
      </motion.div>
    </section>
  );
}
