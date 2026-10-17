"use client";

// When a thing on Today is due, in the colour of its urgency, as NextStep colours a lead's next step (R43): red with a
// dot when overdue, amber with a dot for a new lead still waiting, violet with a clock when due today. A status is a
// dot and a word (DESIGN.md); violet is information about follow-ups, never a button.
import { ClockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Urgency = "overdue" | "waiting" | "today";

const urgencyClasses: Record<Urgency, { text: string; dot: string | null }> = {
  overdue: { text: "text-status-bad-ink", dot: "bg-status-bad-dot" },
  waiting: { text: "text-status-attention-ink", dot: "bg-status-attention-dot" },
  today: { text: "text-people-tint-ink", dot: null },
};

export function WhenMark({ urgency, children }: { urgency: Urgency; children: ReactNode }) {
  const { text, dot } = urgencyClasses[urgency];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-label font-medium whitespace-nowrap", text)}>
      {dot === null ? (
        <ClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      )}
      {children}
    </span>
  );
}
