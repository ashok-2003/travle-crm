"use client";

// The audit log's entries (DESIGN.md section 6): a divided list at every width, since each entry opens its before and
// after below it. Each says what happened, who did it, when in the organization's zone and from where, and leads to
// the record's whole history.
import type { AuditLogEntry } from "@travel-crm/contracts/audit";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { formatDay, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { AuditChange, hasChange } from "./audit-change";
import { useAuditWords } from "./audit-words";
import { recordHistoryHref } from "./record-filter";

/** A text-sized action with a 44px target, aligned with the entry's words. */
const entryAction = "flex min-h-11 w-fit items-center gap-1.5 font-medium text-primary hover:underline";

function AuditEntry({ entry, recordLink }: { entry: AuditLogEntry; recordLink: boolean }) {
  const t = useTranslations("audit");
  const words = useAuditWords();
  const { timeZone } = useMe().organization;
  const [open, setOpen] = useState(false);
  const changeId = useId();
  const instant = new Date(entry.occurredAt);
  const changed = hasChange(entry.before, entry.after);
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <p className="font-medium">{words.action(entry.action)}</p>
      <p className="text-label text-muted-foreground">
        <span className="break-words script-leading">{words.actor(entry.actor)}</span> ·{" "}
        <time dateTime={entry.occurredAt} className="numbers">
          {t("when", { day: formatDay(instant, { timeZone }), time: formatTime(instant, { timeZone }) })}
        </time>{" "}
        · {words.source(entry.source)}
      </p>
      {(changed || recordLink) && (
        <div className="flex flex-wrap gap-x-6">
          {changed && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={open ? changeId : undefined}
              onClick={() => {
                setOpen(!open);
              }}
              className={entryAction}
            >
              {t("change.show")}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn("size-4 motion-safe:transition-transform motion-safe:ease-out", open && "rotate-180")}
              />
            </button>
          )}
          {recordLink && (
            <Link href={recordHistoryHref(entry)} className={entryAction}>
              {t("recordHistory", { kind: entry.entityType })}
            </Link>
          )}
        </div>
      )}
      {changed && open && <AuditChange id={changeId} before={entry.before} after={entry.after} />}
    </li>
  );
}

/** The entries, newest first. `recordLinks` leads each to its record's history; a record's own history needs none. */
export function AuditEntries({ entries, recordLinks }: { entries: AuditLogEntry[]; recordLinks: boolean }) {
  const t = useTranslations("audit");
  return (
    <ul aria-label={t("entries")} className="divide-y rounded-lg border">
      {entries.map((entry) => (
        <AuditEntry key={entry.id} entry={entry} recordLink={recordLinks} />
      ))}
    </ul>
  );
}
