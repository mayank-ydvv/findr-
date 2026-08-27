"use client";

import { motion, useReducedMotion } from "motion/react";

/** Tip-at-origin teardrop, so a pin can be positioned by the point it marks
 * rather than by the centre of its bounding box. */
const PIN_PATH =
  "M 0,0 C -7,-9 -11,-15 -11,-20 A 11,11 0 1,1 11,-20 C 11,-15 7,-9 0,0 Z";

const LOST = { x: 104, y: 116 };
const FOUND = { x: 296, y: 214 };
/** Control point pulled above the straight line so the connector arcs. */
const ARC = `M ${LOST.x} ${LOST.y} Q 200 118 ${FOUND.x} ${FOUND.y}`;

function Pin({
  at,
  color,
  label,
  delay,
  reduced,
}: {
  at: { x: number; y: number };
  color: string;
  label: string;
  delay: number;
  reduced: boolean;
}) {
  return (
    <motion.g
      initial={reduced ? false : { opacity: 0, y: -26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 420, damping: 22 }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    >
      <g transform={`translate(${at.x} ${at.y})`}>
        <ellipse cx="0" cy="3" rx="9" ry="3" fill="rgba(0,0,0,0.35)" />
        <path d={PIN_PATH} fill={color} />
        <circle cx="0" cy="-20" r="4.5" fill="#0f172a" />
      </g>
      <text
        x={at.x}
        y={at.y + 20}
        textAnchor="middle"
        className="fill-fg-subtle"
        style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em" }}
      >
        {label}
      </text>
    </motion.g>
  );
}

export default function HeroMapVisual() {
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 400 320"
        className="w-full h-auto"
        role="img"
        aria-label="Illustration: a lost item pin and a found item pin on a campus map, connected by a line labelled 98 percent match."
      >
        <defs>
          <linearGradient id="arcStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-lost)" />
            <stop offset="100%" stopColor="var(--color-found)" />
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(37,99,235,0.20)" />
            <stop offset="100%" stopColor="rgba(37,99,235,0)" />
          </radialGradient>
        </defs>

        {/* Campus abstraction — a grid, not a real map, so it can't be
            mistaken for live data. */}
        <motion.g
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <rect width="400" height="320" rx="16" fill="var(--color-surface)" />
          <ellipse cx="200" cy="160" rx="170" ry="130" fill="url(#glow)" />
          {[60, 110, 160, 210, 260].map((y) => (
            <line key={y} x1="16" y1={y} x2="384" y2={y} stroke="var(--color-line)" strokeWidth="1" />
          ))}
          {[70, 140, 210, 280, 350].map((x) => (
            <line key={x} x1={x} y1="16" x2={x} y2="304" stroke="var(--color-line)" strokeWidth="1" />
          ))}
          {[
            { cx: 96, cy: 210, r: 30 },
            { cx: 300, cy: 90, r: 24 },
            { cx: 210, cy: 250, r: 20 },
          ].map((z, i) => (
            <circle
              key={i}
              {...z}
              fill="rgba(245,158,11,0.05)"
              stroke="rgba(245,158,11,0.14)"
              strokeWidth="1"
            />
          ))}
          <rect
            width="400"
            height="320"
            rx="16"
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        </motion.g>

        {/* The connector: drawn, not faded, so it reads as the system
            actively linking two reports. */}
        <motion.path
          d={ARC}
          fill="none"
          stroke="url(#arcStroke)"
          strokeWidth="2"
          strokeDasharray="5 5"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: reduced ? 0 : 1.15, duration: 0.9, ease: "easeInOut" }}
        />

        <Pin at={LOST} color="var(--color-lost)" label="LOST" delay={reduced ? 0 : 0.55} reduced={reduced} />
        <Pin at={FOUND} color="var(--color-found)" label="FOUND" delay={reduced ? 0 : 0.85} reduced={reduced} />
      </svg>

      {/* Match badge — HTML rather than SVG text so it inherits real type
          rendering and token colours. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.86, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: reduced ? 0 : 2.0, type: "spring", stiffness: 320, damping: 18 }}
        /* Sits above the arc apex rather than on it. The LOST pin is at ~36%
           of the box height, so anything lower collides with it once the
           badge's fixed padding takes a larger share of a narrow viewport. */
        className="absolute left-1/2 top-[10%] -translate-x-1/2 whitespace-nowrap rounded-full border border-accent/40 bg-bg/90 px-2.5 py-1 shadow-lg backdrop-blur sm:px-3.5 sm:py-1.5"
      >
        <span className="text-[11px] font-semibold tracking-tight text-fg sm:text-[13px]">
          98% match
        </span>
        <span className="ml-1.5 hidden text-[11px] text-fg-muted sm:inline">same object</span>
      </motion.div>
    </div>
  );
}
