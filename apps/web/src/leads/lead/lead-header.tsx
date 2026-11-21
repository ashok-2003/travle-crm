"use client";

// A lead's top (spec 3.4, R48; the lead page's revamp, 2026-11-21), compact, for "is this worth my time": the person's
// name as the screen's title; under it their phone, email and Instagram handle (↺ Returning beside them when they had
// an earlier lead, with its info hint, as the word is new to many), the trip in one line (where · when · who), and how
// warm the lead is: the AI's guess ("Warm 65%", violet) and, when it is hot, why. Then the main buttons: Call, the one
// primary, and WhatsApp, both only with a phone and, on a phone, in the bar at the screen's foot instead
// (LeadActionBar); Messages; the ⋯ menu, which holds Edit person.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LeadTemperature } from "@/ai/insight-card";
import { InfoHint } from "@/components/info-hint";
import { PageHeader } from "@/components/page-header";
import { formatPhoneNumber } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { HotSignals } from "@/sales/lead-sales";
import { CallButton, WhatsAppButton } from "../contact-buttons";
import { ReturningBadge } from "../list/returning-badge";
import { useTripDetails } from "../trip-line";
import { LeadMenu } from "./lead-menu";
import { MessagesButton } from "./messages-dialog";

/** Parts of a line, a dot between each two. */
function dotted(parts: ReactNode[]): ReactNode[] {
  return parts.flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <span key={`dot-${String(index)}`} aria-hidden="true">
            ·
          </span>,
          part,
        ],
  );
}

export function LeadHeader({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const wide = useWideScreen();
  const tripLine = useTripDetails();
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
  const trip = tripLine({
    destinationName: lead.trip.destination?.name ?? null,
    when: lead.trip.when,
    adults: lead.trip.adults,
    childrenCount: lead.trip.childrenAges.length,
  });
  const intro = (
    <span className="flex flex-col gap-1.5">
      {(contacts.length > 0 || lead.returning) && (
        <span data-line="contacts" className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {dotted(contacts)}
          {lead.returning && (
            <span className="inline-flex items-center gap-1.5">
              <ReturningBadge />
              <InfoHint term={t("returning")}>{t("hints.returning")}</InfoHint>
            </span>
          )}
        </span>
      )}
      {trip !== null && (
        <span data-line="trip" className="text-foreground">
          {trip}
        </span>
      )}
      <span data-line="warmth" className="flex flex-wrap items-center gap-2 empty:hidden">
        <LeadTemperature leadId={lead.id} />
        <HotSignals leadId={lead.id} />
      </span>
    </span>
  );
  return (
    <PageHeader
      title={<span className="script-leading">{name}</span>}
      intro={intro}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {wide && phone && callable && <CallButton phone={phone} name={name} leadId={lead.id} />}
          {wide && phone && <WhatsAppButton phone={phone} name={name} leadId={lead.id} />}
          <MessagesButton leadId={lead.id} name={name} phone={phone} />
          <LeadMenu lead={lead} />
        </div>
      }
    />
  );
}
