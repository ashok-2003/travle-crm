"use client";

// A change's before and after (spec 9.5), field by field under the names they were recorded with, each side's value as
// stored, on the registry's Card. A side with no state (the record didn't exist yet, or no longer does) shows None
// for every field.
import type { AuditLogEntry } from "@travel-crm/contracts/audit";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { StoredValue } from "./stored-value";

type Snapshot = AuditLogEntry["before"];

/** The fields either side recorded, in the order they were recorded: the before's first. */
function fieldsOf(before: Snapshot, after: Snapshot): string[] {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
}

function Side({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      <StoredValue value={value} />
    </div>
  );
}

export function AuditChange({ before, after }: { before: Snapshot; after: Snapshot }) {
  const t = useTranslations("audit.change");
  return (
    <Card size="sm">
      <CardContent>
        <dl className="flex flex-col gap-3">
          {fieldsOf(before, after).map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <dt className="text-label font-medium break-words">{field}</dt>
              <dd className="grid gap-2 sm:grid-cols-2">
                <Side label={t("before")} value={before?.[field]} />
                <Side label={t("after")} value={after?.[field]} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Whether there is anything to show: an entry may record no state at all (a password reset, an invite). */
export function hasChange(before: Snapshot, after: Snapshot): boolean {
  return fieldsOf(before, after).length > 0;
}
