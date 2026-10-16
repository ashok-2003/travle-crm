"use client";

// The organization's row (name, code, time zone, contact email, when it was onboarded), with its corrections, and its
// business profile, read-only here: the Owner keeps it up to date, and the account number comes masked by the api.
// GSTIN, IFSC, codes and numbers are mono; dates are the organization's own.
import type { OrganizationRecord } from "@travel-crm/contracts/platform";
import type { OrganizationProfileDetails } from "@travel-crm/contracts/profile";
import { gstStates } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { formatDay } from "@/lib/format";
import { isListedTimeZone } from "../fields/time-zones";
import { CorrectRecordDialog } from "./correct-record-dialog";
import { DetailList, DetailSection } from "./detail-list";
import { formatPhoneNumber } from "./phone-number";

export function RecordSection({ organization }: { organization: OrganizationRecord }) {
  const t = useTranslations("consoleOrganizations.record");
  const tZones = useTranslations("consoleOrganizations.timeZones");
  const zone = isListedTimeZone(organization.timeZone) ? tZones(organization.timeZone) : organization.timeZone;
  return (
    <DetailSection
      id="record-heading"
      heading={t("heading")}
      action={<CorrectRecordDialog organization={organization} />}
    >
      <DetailList
        details={[
          { label: t("name"), value: organization.name },
          { label: t("code"), value: <span className="numbers">{organization.code}</span> },
          { label: t("timeZone"), value: zone },
          {
            label: t("contactEmail"),
            value: organization.contactEmail ?? <span className="text-muted-foreground">{t("noContactEmail")}</span>,
          },
          {
            label: t("onboardedOn"),
            value: (
              <span className="numbers">
                {formatDay(new Date(organization.createdAt), { timeZone: organization.timeZone })}
              </span>
            ),
          },
        ]}
      />
    </DetailSection>
  );
}

export function ProfileSection({ profile }: { profile: OrganizationProfileDetails | null }) {
  const t = useTranslations("consoleOrganizations.profile");
  if (!profile) {
    return (
      <DetailSection id="profile-heading" heading={t("heading")}>
        <p className="text-muted-foreground">{t("none")}</p>
      </DetailSection>
    );
  }
  const notGiven = <span className="text-muted-foreground">{t("notGiven")}</span>;
  const text = (value: string | null) => value ?? notGiven;
  const mono = (value: string | null) => (value === null ? notGiven : <span className="numbers">{value}</span>);
  const state = gstStates.find((candidate) => candidate.code === profile.gstStateCode);
  return (
    <DetailSection id="profile-heading" heading={t("heading")}>
      <DetailList
        details={[
          { label: t("legalName"), value: profile.legalName },
          { label: t("gstin"), value: mono(profile.gstin) },
          {
            label: t("gstState"),
            value: (
              <span className="flex flex-wrap gap-2">
                <span className="numbers">{profile.gstStateCode}</span>
                {state && <span>{state.name}</span>}
              </span>
            ),
          },
          { label: t("address"), value: <span className="whitespace-pre-line">{text(profile.address)}</span> },
          { label: t("contactName"), value: text(profile.contactName) },
          { label: t("contactPhone"), value: mono(profile.contactPhone && formatPhoneNumber(profile.contactPhone)) },
          { label: t("bankAccountName"), value: text(profile.bankAccountName) },
          { label: t("bankAccountNumber"), value: mono(profile.bankAccountNumber) },
          { label: t("bankIfsc"), value: mono(profile.bankIfsc) },
          { label: t("bankName"), value: text(profile.bankName) },
          { label: t("invoicePrefix"), value: mono(profile.invoicePrefix) },
        ]}
      />
      <p className="text-label text-muted-foreground">{t("hint")}</p>
    </DetailSection>
  );
}
