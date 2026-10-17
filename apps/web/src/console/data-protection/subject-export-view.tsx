"use client";

// What the organization keeps about one person or record, as the export gave it, for the person: who they were (for a
// member), a customer's contacts and how much is kept about their leads, with the whole of it to copy as JSON (R39),
// how many audit entries name them, and their files, each with a link that works for 15 minutes.
import type { CustomerExport, SubjectExport } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { Details } from "@/components/details";
import { TextLink } from "@/components/text-link";
import { Card, CardContent } from "@/components/ui/card";
import { formatFileSize } from "@/files/file-size";
import { formatDay, formatPhoneNumber } from "@/lib/format";
import { shownEmail } from "@/lib/shown-email";
import { useInstantText } from "@/components/instant-text";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";

/** A customer's contacts, what is kept about their leads in counts, and the whole export to copy and hand them. */
function CustomerPart({ customer }: { customer: CustomerExport }) {
  const t = useTranslations("consolePlatform.dataProtection.subject.customer");
  const total = (count: (lead: CustomerExport["leads"][number]) => number) =>
    customer.leads.reduce((sum, lead) => sum + count(lead), 0);
  const contacts = [
    { label: t("name"), value: customer.name === "" ? t("erased") : customer.name },
    ...(customer.phone === null ? [] : [{ label: t("phone"), value: formatPhoneNumber(customer.phone) }]),
    ...(customer.email === null ? [] : [{ label: t("email"), value: customer.email }]),
    ...(customer.instagramHandle === null ? [] : [{ label: t("instagram"), value: `@${customer.instagramHandle}` }]),
  ];
  const counts = {
    leads: customer.leads.length,
    notes: total((lead) => lead.notes.length),
    enquiries: total((lead) => lead.enquiries.length),
    tasks: total((lead) => lead.tasks.length),
  };
  const kept = {
    label: t("kept"),
    value: t("counts", counts),
    action: <CopyButton value={JSON.stringify(customer, null, 2)} label={t("copy")} />,
  };
  return <Details rows={[...contacts, kept]} />;
}

export function SubjectExportView({ exported }: { exported: SubjectExport }) {
  const t = useTranslations("consolePlatform.dataProtection.subject");
  const instantText = useInstantText();
  const { person } = exported;
  const dayOf = (iso: string) => formatDay(new Date(iso), { timeZone: PLATFORM_TIME_ZONE });
  const facts =
    person === null
      ? []
      : [
          { label: t("personFacts.name"), value: person.name },
          { label: t("personFacts.email"), value: shownEmail(person.email) },
          { label: t("personFacts.username"), value: person.username },
          { label: t("personFacts.role"), value: person.role },
          { label: t("personFacts.joined"), value: dayOf(person.joinedAt) },
          { label: t("personFacts.removed"), value: person.removedAt === null ? null : dayOf(person.removedAt) },
        ];
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-caption text-muted-foreground">
          {t("exportedAt", { when: instantText(exported.exportedAt) })}
        </p>
        {facts.length > 0 && (
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
            {facts.map((fact) =>
              fact.value === null ? null : (
                <div key={fact.label} className="contents">
                  <dt className="text-label text-muted-foreground">{fact.label}</dt>
                  <dd className="break-words script-leading">{fact.value}</dd>
                </div>
              ),
            )}
          </dl>
        )}
        {exported.customer && <CustomerPart customer={exported.customer} />}
        <p className="numbers text-label">{t("auditEntries", { count: exported.auditEntries.length })}</p>
        {exported.files.length === 0 ? (
          <p className="text-label text-muted-foreground">{t("noFiles")}</p>
        ) : (
          <ul className="flex flex-col">
            {exported.files.map((file) => (
              <li key={file.id} className="flex min-h-11 flex-wrap items-center gap-x-3">
                {file.downloadUrl === null ? (
                  <span className="break-all">{file.fileName}</span>
                ) : (
                  <TextLink href={file.downloadUrl}>
                    <span className="break-all">{file.fileName}</span>
                  </TextLink>
                )}
                <span className="numbers text-caption text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
                {file.sensitive && <span className="text-caption text-muted-foreground">{t("sensitive")}</span>}
                {file.deleted && <span className="text-caption text-muted-foreground">{t("deletedFile")}</span>}
                {file.downloadUrl === null && <span className="text-caption text-muted-foreground">{t("noLink")}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
