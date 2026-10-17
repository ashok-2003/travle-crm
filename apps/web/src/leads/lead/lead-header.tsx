"use client";

// A lead's top (spec 3.4, R48): the person's name as the screen's title, their phone, email and Instagram handle under
// it (↺ Returning beside them when they had an earlier lead), and the main buttons: Call, the one primary, and
// WhatsApp, both only with a phone; then the ⋯ menu.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { PageHeader } from "@/components/page-header";
import { formatPhoneNumber } from "@/lib/format";
import { CallButton, WhatsAppButton } from "../contact-buttons";
import { ReturningBadge } from "../list/returning-badge";
import { LeadMenu } from "./lead-menu";

export function LeadHeader({ lead }: { lead: LeadDetail }) {
  const { name, phone, email, instagramHandle } = lead.person;
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
      {lead.returning && <ReturningBadge />}
    </span>
  );
  return (
    <PageHeader
      title={<span className="script-leading">{name}</span>}
      {...(intro && { intro })}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {phone && <CallButton phone={phone} name={name} />}
          {phone && <WhatsAppButton phone={phone} name={name} />}
          <LeadMenu lead={lead} />
        </div>
      }
    />
  );
}
