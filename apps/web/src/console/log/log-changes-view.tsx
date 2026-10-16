"use client";

// A platform log entry's changes, opened on request under the registry Collapsible: only the fields that differ, each
// under its name in words, with the shared AuditChange showing before and after. Values are read for people: a day as
// dd/mm/yyyy, a moment as the console's clocks show it, paise as rupees with lakh grouping, a size in GB.
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuditChange } from "@/components/audit-change";
import { useInstantText } from "@/components/instant-text";
import { indianDate } from "@/components/date-field";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatFileSize } from "@/files/file-size";
import { rupees } from "@/components/forms/money-field";
import { changesOf, isNamedField, snapshotsOf } from "./log-changes";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T/;

export function LogChanges({ entry }: { entry: Pick<PlatformLogEntry, "before" | "after"> }) {
  const t = useTranslations("consolePlatform.log");
  const instantText = useInstantText();
  const [open, setOpen] = useState(false);
  const changes = changesOf(entry.before, entry.after);
  if (changes.length === 0) return null;
  const name = (field: string) => (isNamedField(field) ? t(`fields.${field}`) : field);
  const show = (field: string, value: unknown): unknown => {
    if (typeof value === "number" && field.endsWith("Paise")) return rupees(value);
    if (typeof value === "number" && field === "storageLimitBytes") return formatFileSize(value);
    if (typeof value !== "string") return value;
    if (DAY.test(value)) return indianDate(value);
    return MOMENT.test(value) ? instantText(value) : value;
  };
  const { before, after } = snapshotsOf(changes, name, show);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger asChild>
        <Button variant="link" className="self-start px-0">
          {open ? t("hideChanges") : t("changes")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <AuditChange before={before} after={after} />
      </CollapsibleContent>
    </Collapsible>
  );
}
