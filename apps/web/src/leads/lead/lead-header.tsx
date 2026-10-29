"use client";

// A lead's top (spec 3.4, R48): the person's name as the screen's title, their phone, email and Instagram handle under
// it (↺ Returning beside them when they had an earlier lead, with its info hint, as the word is new to many), and the
// main buttons: Call, the one primary, and WhatsApp, both only with a phone; then the ⋯ menu.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/info-hint";
import { PageHeader } from "@/components/page-header";
import { formatPhoneNumber } from "@/lib/format";
import { CallButton, WhatsAppButton } from "../contact-buttons";
import { ReturningBadge } from "../list/returning-badge";
import { LeadMenu } from "./lead-menu";
import { MessagesButton } from "./messages-dialog";

export function LeadHeader({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const { name, phone, email, instagramHandle } = lead.person;
  // Blocking a contact makes its lead Not a lead: no one is called from it any more.
  const callable = lead.stage !== "not_a_lead";
  const contacts = [
    phone && (
      <span key="phone" className="numbers">
        {formatPhoneNumber(phone)}
      </span>
    ),
    email && (
      <span key="email" className="wrap-anywhere">
        {email}
      </span>
    ),
    instagramHandle && <span key="handle">@{instagramHandle}</span>,
    lead.callCount > 0 && <span key="calls">{t("lead.callCount", { count: lead.callCount })}</span>,
  ].filter(Boolean);
  const intro = (contacts.length > 0 || lead.returning) && (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {contacts.flatMap((contact, index) =>
        index === 0
          ? [contact]
          : [
              <span key={`dot-${String(index)}`} aria-hidden="true">
                ·
              </span>,
              contact,
            ],
      )}
      {lead.returning && (
        <span className="inline-flex items-center gap-1.5">
          <ReturningBadge />
          <InfoHint term={t("returning")}>{t("hints.returning")}</InfoHint>
        </span>
      )}
    </span>
  );
  return (
    <PageHeader
      title={<span className="script-leading">{name}</span>}
      {...(intro && { intro })}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {phone && callable && <CallButton phone={phone} name={name} leadId={lead.id} />}
          {phone && <WhatsAppButton phone={phone} name={name} />}
          <MessagesButton leadId={lead.id} name={name} phone={phone} />
          <LeadMenu lead={lead} />
        </div>
      }
    />
  );
}
