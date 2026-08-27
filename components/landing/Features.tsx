"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { Fingerprint, Map, ShieldCheck, MessagesSquare } from "lucide-react";

const FEATURES = [
  {
    icon: Fingerprint,
    title: "One fingerprint, not two scores",
    body: "Your photo and your description are embedded into the same vector space, so a finder's photo can match an owner's typed description directly — the case Findr actually has to solve.",
  },
  {
    icon: Map,
    title: "A live map, not a feed",
    body: "Every report drops onto a map of campus in real time, with heat zones showing where things actually go missing. Confirmed matches draw a line from where it was lost to where it turned up.",
  },
  {
    icon: ShieldCheck,
    title: "Proof before pickup",
    body: "Findr writes ownership questions from details only the real owner would know, grades the answers, and keeps the exact pickup spot hidden until someone passes.",
  },
  {
    icon: MessagesSquare,
    title: "Talk without swapping numbers",
    body: "Once a claim is verified, both sides get an anonymous thread. No phone numbers, no usernames, nothing that outlives the handover.",
  },
];

const card: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

export default function Features() {
  const reduced = useReducedMotion() ?? false;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hover">
          How it works
        </p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          Built for the part that actually fails
        </h2>
        <p className="mt-4 text-fg-muted">
          Someone usually does pick your things up. The problem is that their post never
          reaches you — so Findr does the searching instead of waiting for you to scroll.
        </p>
      </div>

      <motion.ul
        variants={{ hidden: {}, show: { transition: reduced ? {} : { staggerChildren: 0.08 } } }}
        initial={reduced ? false : "hidden"}
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-10 grid gap-4 sm:grid-cols-2"
      >
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <motion.li
            key={title}
            variants={card}
            className="group rounded-xl border border-line bg-surface p-6 transition-colors duration-200 hover:border-line-strong"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
              <Icon className="h-5 w-5 text-accent-hover" aria-hidden />
            </span>
            <h3 className="mt-4 font-semibold tracking-tight text-fg">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
