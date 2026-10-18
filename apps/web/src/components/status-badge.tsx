// A record's status (DESIGN.md section 6): always a dot and a word, never colour alone. Status colours mean status
// only: good (Confirmed, Paid, Done), attention (Payment due, Pending), bad (Overdue, Lost), neutral (Draft,
// Archived). A lead's stage is a status in its own colour (DESIGN.md "Stage Colours"), so the badge also takes a tone's
// classes. The dot alone (StatusDot) goes before a status's words where they sit inline without a badge, as in a dense
// list.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "good" | "attention" | "bad" | "neutral";

/** A tone's tint and ink, and its dot, as Tailwind classes. */
export interface ToneClasses {
  badge: string;
  dot: string;
}

/** Each tone's tint and ink, and its dot. Written out in full so Tailwind finds every class. */
export const statusToneClasses: Record<StatusTone, ToneClasses> = {
  good: { badge: "bg-status-good-fill text-status-good-ink", dot: "bg-status-good-dot" },
  attention: { badge: "bg-status-attention-fill text-status-attention-ink", dot: "bg-status-attention-dot" },
  bad: { badge: "bg-status-bad-fill text-status-bad-ink", dot: "bg-status-bad-dot" },
  neutral: { badge: "bg-status-neutral-fill text-status-neutral-ink", dot: "bg-status-neutral-dot" },
};

const classesOf = (tone: StatusTone | ToneClasses) => (typeof tone === "string" ? statusToneClasses[tone] : tone);

/** A status's 6px dot, decoration beside the words that say it. */
export function StatusDot({ tone, className }: { tone: StatusTone | ToneClasses; className?: string }) {
  return <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", classesOf(tone).dot, className)} />;
}

export function StatusBadge({ tone, children }: { tone: StatusTone | ToneClasses; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-badge px-2 text-caption font-medium whitespace-nowrap",
        classesOf(tone).badge,
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}
