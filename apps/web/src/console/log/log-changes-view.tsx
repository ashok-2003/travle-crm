"use client";

// A platform log entry's changes, opened on request under the registry Collapsible: the shared AuditChange, which
// shows only the fields that differ, given the console's words. Field names are words, and values are read for people:
// a day as "16 Oct", a moment as the console's clocks show it, paise as rupees with lakh grouping, a size in GB, and a
// coded value (a state, a level, a billing cycle, a module, a plan) as its words. A record's own id is left out.
import { formatCalendarDay } from "@/lib/format";
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuditChange, hasChange } from "@/components/audit-change";
import { useInstantText } from "@/components/instant-text";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatFileSize } from "@/files/file-size";
import { rupees } from "@/components/forms/money-field";
import type { LogNames } from "./use-log-names";

/** The stored fields the console names in words (consolePlatform.log.fields); another shows as stored. */
const NAMED_FIELDS = [
  "paidOn",
  "amountPaise",
  "paysThrough",
  "paidThrough",
  "status",
  "planId",
  "billingCycle",
  "extraSeats",
  "customPricePaise",
  "extraModules",
  "trialEndsOn",
  "suspendedByHand",
  "key",
  "name",
  "nameChanged",
  "monthlyPricePaise",
  "yearlyPricePaise",
  "extraSeatMonthlyPricePaise",
  "extraSeatYearlyPricePaise",
  "seatLimit",
  "whatsappNumberLimit",
  "storageLimitBytes",
  "modules",
  "archived",
  "level",
  "code",
  "timeZone",
  "contactEmail",
  "trialDays",
  "pastDueDays",
  "readOnlyDays",
  "rows",
  "people",
  "files",
  "reason",
] as const;

type NamedField = (typeof NAMED_FIELDS)[number];

const isNamedField = (field: string): field is NamedField => (NAMED_FIELDS as readonly string[]).includes(field);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T/;
const STATES = ["trial", "active", "past_due", "read_only", "suspended", "cancelled", "none"] as const;
const LEVELS = ["support", "super-admin"] as const;
const CYCLES = ["monthly", "yearly"] as const;
const MODULES = [
  "crm",
  "inbox",
  "catalog",
  "quotes",
  "bookings",
  "departures",
  "suppliers",
  "accounts",
  "reports",
] as const;

/** A coded value's words when it is one of `options`, else undefined (shown as stored). */
function say<T extends string>(options: readonly T[], value: string, words: (option: T) => string): string | undefined {
  const option = options.find((known) => known === value);
  return option && words(option);
}

/** The records' own ids the platform module stores beside their changes, which say nothing to a reader. */
const OWN_IDS = new Set(["paymentId", "exportId"]);

/** The entry's snapshots without the record's own id. */
function withoutOwnId(snapshot: PlatformLogEntry["before"]): PlatformLogEntry["before"] {
  if (snapshot === null) return null;
  return Object.fromEntries(Object.entries(snapshot).filter(([field]) => !OWN_IDS.has(field)));
}

export function LogChanges({ entry, names }: { entry: Pick<PlatformLogEntry, "before" | "after">; names: LogNames }) {
  const t = useTranslations("consolePlatform.log");
  const tStates = useTranslations("console.status");
  const tLevels = useTranslations("console.levels");
  const tCycles = useTranslations("consoleOrganizations.subscription.cycles");
  const tModules = useTranslations("consolePlatform.modules");
  const instantText = useInstantText();
  const [open, setOpen] = useState(false);
  const before = withoutOwnId(entry.before);
  const after = withoutOwnId(entry.after);
  if (!hasChange(before, after)) return null;

  const fieldName = (field: string) => (isNamedField(field) ? t(`fields.${field}`) : field);
  const valueText = (field: string, value: unknown): string | undefined => {
    if (typeof value === "number" && field.endsWith("Paise")) return rupees(value);
    if (typeof value === "number" && field === "storageLimitBytes") return formatFileSize(value);
    if (typeof value !== "string") return undefined;
    if (field === "status") return say(STATES, value, tStates);
    if (field === "level") return say(LEVELS, value, tLevels);
    if (field === "billingCycle") return say(CYCLES, value, tCycles);
    if (field === "modules" || field === "extraModules") return say(MODULES, value, tModules);
    if (field === "planId") return names.planName(value) ?? undefined;
    if (DAY.test(value)) return formatCalendarDay(value);
    return MOMENT.test(value) ? instantText(value) : undefined;
  };
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger asChild>
        <Button variant="link" className="self-start px-0">
          {open ? t("hideChanges") : t("changes")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <AuditChange before={before} after={after} fieldName={fieldName} valueText={valueText} />
      </CollapsibleContent>
    </Collapsible>
  );
}
