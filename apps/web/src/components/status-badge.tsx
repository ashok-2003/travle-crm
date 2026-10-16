// A record's status (DESIGN.md section 6): always a dot and a word, never colour alone. Status colours mean status
// only: good (Confirmed, Paid), attention (Payment due, Pending), bad (Overdue, Lost), neutral (Draft, New).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "good" | "attention" | "bad" | "neutral";

/** Each tone's tint and ink, and its dot. Written out in full so Tailwind finds every class. */
export const statusToneClasses: Record<StatusTone, { badge: string; dot: string }> = {
  good: { badge: "bg-status-good-fill text-status-good-ink", dot: "bg-status-good-dot" },
  attention: { badge: "bg-status-attention-fill text-status-attention-ink", dot: "bg-status-attention-dot" },
  bad: { badge: "bg-status-bad-fill text-status-bad-ink", dot: "bg-status-bad-dot" },
  neutral: { badge: "bg-status-neutral-fill text-status-neutral-ink", dot: "bg-status-neutral-dot" },
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const classes = statusToneClasses[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-badge px-2 text-caption font-medium whitespace-nowrap",
        classes.badge,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", classes.dot)} />
      {children}
    </span>
  );
}
