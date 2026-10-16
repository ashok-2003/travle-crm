"use client";

// What the organization keeps about one person or record, as the export gave it, for the person: who they were (for a
// member), how many audit entries name them, and their files, each with a link that works for 15 minutes.
import type { SubjectExport } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { formatFileSize } from "@/files/file-size";
import { formatDay } from "@/lib/format";
import { shownEmail } from "@/lib/shown-email";
import { useInstantText } from "@/components/instant-text";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";

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
                  <a href={file.downloadUrl} className="text-primary underline-offset-4 break-all hover:underline">
                    {file.fileName}
                  </a>
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
