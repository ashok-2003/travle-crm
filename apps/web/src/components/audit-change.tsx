"use client";

// A change (spec 9.5): only the fields whose value changed, each under its words (`fieldName`); a list as what was
// added to it and what was removed from it, anything else as before and after; values in words where the caller
// knows them (`valueText`), as stored otherwise (StoredValue). A side with no state (the record didn't exist yet, or
// no longer does) shows None. On the registry's Card.
import type { AuditLogEntry } from "@travel-crm/contracts/audit";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StoredValue } from "./stored-value";

type Snapshot = AuditLogEntry["before"];

const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

/** The fields whose value differs between the sides, in the order they were recorded: the before's first. */
function changedFields(before: Snapshot, after: Snapshot): string[] {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...fields].filter((field) => !same(before?.[field], after?.[field]));
}

/** A list's change as what was added and what was removed, or null when the field isn't a list. */
function listChange(was: unknown, is: unknown): { added: unknown[]; removed: unknown[] } | null {
  const listOrNothing = (value: unknown) => Array.isArray(value) || value === null || value === undefined;
  if ((!Array.isArray(was) && !Array.isArray(is)) || !listOrNothing(was) || !listOrNothing(is)) return null;
  const before: unknown[] = Array.isArray(was) ? was : [];
  const after: unknown[] = Array.isArray(is) ? is : [];
  return {
    added: after.filter((item) => !before.some((old) => same(old, item))),
    removed: before.filter((old) => !after.some((item) => same(old, item))),
  };
}

function Side({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function AuditChange({
  before,
  after,
  fieldName = (field) => field,
  valueText = () => undefined,
}: {
  before: Snapshot;
  after: Snapshot;
  /** A field's words ("Permissions" for `permissions`); its recorded name by default. */
  fieldName?: (field: string) => string;
  /** A value's words ("See the audit log" for a permission's grant), or undefined to show it as stored. */
  valueText?: (field: string, value: unknown) => string | undefined;
}) {
  const t = useTranslations("audit.change");
  const shown = (field: string, value: unknown) => valueText(field, value) ?? <StoredValue value={value} />;
  const items = (field: string, values: unknown[]) => (
    <ul className="flex flex-col gap-1">
      {values.map((value, index) => (
        // A recorded list has no ids, and an entry never changes, so its positions are stable keys.
        <li key={index}>{shown(field, value)}</li>
      ))}
    </ul>
  );
  return (
    <Card size="sm">
      <CardContent>
        <dl className="flex flex-col gap-3">
          {changedFields(before, after).map((field) => {
            const list = listChange(before?.[field], after?.[field]);
            return (
              <div key={field} className="flex flex-col gap-1">
                <dt className="text-label font-medium break-words">{fieldName(field)}</dt>
                <dd className="grid gap-2 sm:grid-cols-2">
                  {list ? (
                    <>
                      {list.added.length > 0 && <Side label={t("added")}>{items(field, list.added)}</Side>}
                      {list.removed.length > 0 && <Side label={t("removed")}>{items(field, list.removed)}</Side>}
                    </>
                  ) : (
                    <>
                      <Side label={t("before")}>{shown(field, before?.[field])}</Side>
                      <Side label={t("after")}>{shown(field, after?.[field])}</Side>
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Whether there is anything to show: an entry may record no state (a password reset), or none that changed. */
export function hasChange(before: Snapshot, after: Snapshot): boolean {
  return changedFields(before, after).length > 0;
}
