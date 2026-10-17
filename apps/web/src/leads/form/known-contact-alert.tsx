"use client";

// What the form says about a known contact before saving (spec 3.2, R24, R33): a blocked contact warns and still
// saves; a person with an open lead is named with only its destination and owner (and a link when the asker can see
// it), with the choice of adding this enquiry to it or making a new trip enquiry; a person without one is returning.
// Either way the lead keeps the person's stored name, which the form shows.
import type { KnownContactResult } from "@travel-crm/contracts/crm";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { ChoiceField } from "@/components/forms/choice-field";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { leadRoute } from "@/lib/routes";
import type { LeadFormValues } from "./lead-form-values";

export function KnownContactAlert({ known, form }: { known: KnownContactResult; form: UseFormReturn<LeadFormValues> }) {
  const t = useTranslations("leads.form.known");
  const { match } = known;
  const openLead = match?.openLead ?? null;
  const ownerName = (userId: string) => known.people[userId] ?? t("formerMember");
  const details = openLead && [
    openLead.destinationName,
    openLead.ownerUserId === null ? t("unassigned") : t("withOwner", { owner: ownerName(openLead.ownerUserId) }),
  ];
  return (
    <>
      {known.blocked && (
        <Alert>
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{t("blocked")}</AlertDescription>
        </Alert>
      )}
      {match && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertTitle className="script-leading">
            {details
              ? t("openLead", { name: match.personName, details: details.filter(Boolean).join(", ") })
              : t("returning", { name: match.personName })}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start">
            <span className="script-leading">{t("storedName", { name: match.personName })}</span>
            {openLead?.leadId && <TextLink href={leadRoute(openLead.leadId)}>{t("openThatLead")}</TextLink>}
          </AlertDescription>
        </Alert>
      )}
      {openLead && (
        <ChoiceField
          control={form.control}
          name="whenOpenLead"
          legend={t("choice")}
          options={[
            { value: "add-to-it", label: t("addToIt"), description: t("addToItHint") },
            { value: "new-lead", label: t("newLead"), description: t("newLeadHint") },
          ]}
        />
      )}
    </>
  );
}
