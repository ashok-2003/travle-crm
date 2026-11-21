"use client";

// A lead's main moves on a phone (the lead page's revamp, 2026-11-21): Call, WhatsApp and Note in a bar that stays at the
// screen's foot, above the app's bottom bar, while the page scrolls under it (sticky, so it also keeps its own room at
// the page's end and covers nothing). Call and WhatsApp only with a phone (Call not on a Not a lead lead, as the
// header's), Note for whoever can edit the lead: it brings the timeline's note box into view and into use. Nothing when
// none of them is offered. Toasts rise above it (globals.css, data-lead-action-bar).
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useHolds } from "@/session/me-context";
import { CallButton, WhatsAppButton } from "../contact-buttons";

export function LeadActionBar({ lead, onNote }: { lead: LeadDetail; onNote: () => void }) {
  const t = useTranslations("leads.lead.actionBar");
  const canEdit = useHolds("leads:edit");
  const { name, phone } = lead.person;
  const callable = phone !== null && lead.stage !== "not_a_lead";
  if (phone === null && !canEdit) return null;
  return (
    <div
      role="group"
      aria-label={t("label", { name })}
      data-lead-action-bar
      className="sticky bottom-[var(--phone-navigation-height,0px)] z-(--z-sticky) -mx-4 flex flex-col bg-background sm:-mx-6"
    >
      <Separator />
      <div className="flex gap-2 px-4 py-2 *:flex-1 sm:px-6">
        {callable && <CallButton phone={phone} name={name} leadId={lead.id} />}
        {phone !== null && <WhatsAppButton phone={phone} name={name} leadId={lead.id} />}
        {canEdit && (
          <Button variant="outline" onClick={onNote}>
            <PlusIcon aria-hidden="true" />
            {t("note")}
          </Button>
        )}
      </div>
    </div>
  );
}
