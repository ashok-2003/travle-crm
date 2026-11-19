"use client";

// Magic UI's Border Beam (magicui.design/r/border-beam.json, the owner's ask on 2026-11-20): a beam of light that keeps
// travelling around its parent's edge, to make one button stand out. The parent is `relative` and rounded; the beam
// sits over its edge and never takes a click. Its colours are the caller's (brand variables, head first), the action
// blue unless told; still for whoever asks for reduced motion.
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface BorderBeamProps {
  /** The beam's length, px. */
  size?: number;
  /** Seconds for one trip round the edge. */
  duration?: number;
  /** The beam's colours from its head back, as CSS colours (brand variables); it fades out after the last. */
  colors?: readonly string[];
  /** The edge's width, px. */
  borderWidth?: number;
  className?: string;
}

export function BorderBeam({
  className,
  size = 48,
  duration = 4,
  colors = ["var(--brand-action)", "color-mix(in oklab, var(--brand-action) 45%, transparent)"],
  borderWidth = 2,
}: BorderBeamProps) {
  if (useReducedMotion() === true) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(var(--card),var(--card))] mask-intersect [mask-clip:padding-box,border-box]"
      style={{ "--border-beam-width": `${String(borderWidth)}px` } as CSSProperties}
    >
      <motion.span
        className={cn("absolute block aspect-square", className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${String(size)}px)`,
          backgroundImage: `linear-gradient(to left, ${colors.join(", ")}, transparent)`,
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration }}
      />
    </span>
  );
}
