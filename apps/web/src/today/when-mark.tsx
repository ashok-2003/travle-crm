"use client";

// When a thing on Today is due, in the colour of its urgency, as NextStep colours a lead's next step (R43), with its
// tones: red with a dot when overdue, amber with a dot for a new lead still waiting, violet with a clock when due
// today. A status is a dot and a word (DESIGN.md); violet is information about follow-ups, never a button.
import { ClockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { StatusDot } from "@/components/status-badge";
import { tones, type Tone } from "@/leads/next-step";
import { cn } from "@/lib/utils";

export type Urgency = Exclude<Tone, "quiet">;

export function WhenMark({ urgency, children }: { urgency: Urgency; children: ReactNode }) {
  const { ink, status } = tones[urgency];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-label font-medium whitespace-nowrap", ink)}>
      {status === null ? <ClockIcon aria-hidden="true" className="size-3.5 shrink-0" /> : <StatusDot tone={status} />}
      {children}
    </span>
  );
}
