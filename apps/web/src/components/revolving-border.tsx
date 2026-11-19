"use client";

// A ring of colour that turns round one button's edge, with a soft glow round it, to make that button stand out (the
// owner, 2026-11-20: the Leads header's Pipeline, in a rainbow). A conic gradient turns behind a thin ring cut from the
// button's own shape, so the light flows evenly round a pill as round a square; the glow is the same gradient blurred
// under the button. It wraps the button and never takes a click. For whoever asks for reduced motion it holds still.
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

/** A gradient square, twice its parent's width and centred on it, so it covers the parent at any angle while it turns. */
function Turning({ colors, duration, still }: { colors: readonly string[]; duration: number; still: boolean }) {
  const first = colors[0] ?? "currentColor";
  return (
    <motion.span
      className="absolute top-1/2 left-1/2 block aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2"
      style={{ backgroundImage: `conic-gradient(from 0deg, ${[...colors, first].join(", ")})` }}
      {...(!still && { animate: { rotate: 360 }, transition: { repeat: Infinity, ease: "linear", duration } })}
    />
  );
}

// The ring, laid over the button's own 1px edge so only the colour shows: the button's shape less its inside, a `width`-wide edge (two masks of the same box, one clipped to the
// padding's inside, subtracted).
const ring = (width: number): CSSProperties => ({
  padding: width,
  mask: "linear-gradient(var(--card) 0 0) content-box exclude, linear-gradient(var(--card) 0 0)",
});

export function RevolvingBorder({
  colors,
  duration = 4,
  width = 2,
  children,
}: {
  /** The ring's colours in order round it (brand variables); it closes back on the first. */
  colors: readonly string[];
  /** Seconds for one turn. */
  duration?: number;
  /** The ring's width, px. */
  width?: number;
  /** The one control it rings: a pill (a registry Button), with a background of its own. */
  children: ReactNode;
}) {
  const still = useReducedMotion() === true;
  // Its own layer (`isolate`): the glow paints above the page and under the button's background, so it shows only
  // round the outside; the ring, after the button, paints over its edge.
  return (
    <span className="relative isolate inline-flex rounded-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 -z-10 overflow-hidden rounded-[inherit] opacity-60 blur-md"
      >
        <Turning colors={colors} duration={duration} still={still} />
      </span>
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        style={ring(width)}
      >
        <Turning colors={colors} duration={duration} still={still} />
      </span>
    </span>
  );
}
