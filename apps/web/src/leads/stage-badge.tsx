"use client";

// A lead's stage as a badge (DESIGN.md "Stage Colours"): each stage in its own subtle colour, so stages are told apart
// at a glance, always a dot and the stage's word. The open stages have hues of their own (New sky, Contacted teal,
// Booking requested lime); Quote sent is status amber (awaiting the customer's reply), Won status green (done), Lost
// status red and Not a lead status neutral. StageDot is the dot alone, before a stage's words elsewhere.
import type { LeadStage } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { StatusBadge, StatusDot, statusToneClasses, type ToneClasses } from "@/components/status-badge";

/** Each stage's colours: its badge, and its dot (also the stage bar's fill). Written out in full so Tailwind finds them. */
export const stageTones: Record<LeadStage, ToneClasses> = {
  new: { badge: "bg-stage-new-fill text-stage-new-ink", dot: "bg-stage-new-dot" },
  contacted: { badge: "bg-stage-contacted-fill text-stage-contacted-ink", dot: "bg-stage-contacted-dot" },
  quote_sent: statusToneClasses.attention,
  booking_requested: {
    badge: "bg-stage-booking-requested-fill text-stage-booking-requested-ink",
    dot: "bg-stage-booking-requested-dot",
  },
  won: statusToneClasses.good,
  lost: statusToneClasses.bad,
  not_a_lead: statusToneClasses.neutral,
};

export function StageBadge({ stage }: { stage: LeadStage }) {
  const t = useTranslations("leads.stages");
  return <StatusBadge tone={stageTones[stage]}>{t(stage)}</StatusBadge>;
}

/** A stage's 6px dot, decoration beside the words that name the stage. */
export function StageDot({ stage, className }: { stage: LeadStage; className?: string }) {
  return <StatusDot tone={stageTones[stage]} {...(className !== undefined && { className })} />;
}
