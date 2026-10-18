"use client";

// A lead's stage as a badge (DESIGN.md "Stage Colours"): each stage in its own subtle colour, so stages are told apart
// at a glance, always a dot and the stage's word. The open stages have hues of their own (New sky, Contacted teal,
// Booking requested indigo); Quote sent is status amber (awaiting the customer's reply), Won status green (done), Lost
// status red and Not a lead status neutral. StageDot is the dot alone, before a stage's words elsewhere.
import type { LeadStage } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { StatusBadge, StatusDot, statusToneClasses, type ToneClasses } from "@/components/status-badge";

/** A stage's badge and dot, and its stage bar segment once the lead has passed it: the dot's colour, lighter. */
export interface StageTone extends ToneClasses {
  passed: string;
}

/** Each stage's colours. Written out in full so Tailwind finds every class. */
export const stageTones: Record<LeadStage, StageTone> = {
  new: { badge: "bg-stage-new-fill text-stage-new-ink", dot: "bg-stage-new-dot", passed: "bg-stage-new-dot/40" },
  contacted: {
    badge: "bg-stage-contacted-fill text-stage-contacted-ink",
    dot: "bg-stage-contacted-dot",
    passed: "bg-stage-contacted-dot/40",
  },
  quote_sent: { ...statusToneClasses.attention, passed: "bg-status-attention-dot/40" },
  booking_requested: {
    badge: "bg-stage-booking-requested-fill text-stage-booking-requested-ink",
    dot: "bg-stage-booking-requested-dot",
    passed: "bg-stage-booking-requested-dot/40",
  },
  won: { ...statusToneClasses.good, passed: "bg-status-good-dot/40" },
  lost: { ...statusToneClasses.bad, passed: "bg-status-bad-dot/40" },
  not_a_lead: { ...statusToneClasses.neutral, passed: "bg-status-neutral-dot/40" },
};

export function StageBadge({ stage }: { stage: LeadStage }) {
  const t = useTranslations("leads.stages");
  return <StatusBadge tone={stageTones[stage]}>{t(stage)}</StatusBadge>;
}

/** A stage's 6px dot, decoration beside the words that name the stage. */
export function StageDot({ stage, className }: { stage: LeadStage; className?: string }) {
  return <StatusDot tone={stageTones[stage]} {...(className !== undefined && { className })} />;
}
