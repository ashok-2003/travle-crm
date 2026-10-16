"use client";

// The audit log's entries (DESIGN.md section 6): a list of items at every width, since each entry opens its before
// and after below it (the registry's Collapsible). Each says what happened, who did it, when in the organization's
// zone and from where, and leads to the record's whole history.
import type { AuditLogEntry } from "@travel-crm/contracts/audit";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { AuditChange, hasChange } from "@/components/audit-change";
import { useAuditWords } from "./audit-words";
import { recordHistoryHref } from "./record-filter";

function AuditEntry({ entry, recordLink }: { entry: AuditLogEntry; recordLink: boolean }) {
  const t = useTranslations("audit");
  const words = useAuditWords();
  const { timeZone } = useMe().organization;
  const instant = new Date(entry.occurredAt);
  const changed = hasChange(entry.before, entry.after);
  return (
    <Item size="sm" role="listitem">
      <ItemContent>
        <ItemTitle>{words.action(entry.action)}</ItemTitle>
        <ItemDescription>
          <span className="break-words script-leading">{words.actor(entry.actor)}</span> ·{" "}
          <time dateTime={entry.occurredAt} className="numbers">
            {formatDayTime(instant, { timeZone })}
          </time>{" "}
          · {words.source(entry.source)}
        </ItemDescription>
        {(changed || recordLink) && (
          <Collapsible className="flex flex-col">
            <div className="flex flex-wrap gap-x-6">
              {changed && (
                <CollapsibleTrigger asChild>
                  <Button variant="link" className="px-0">
                    {t("change.show")}
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="motion-safe:transition-transform motion-safe:ease-out group-data-[state=open]/button:rotate-180"
                    />
                  </Button>
                </CollapsibleTrigger>
              )}
              {recordLink && (
                <Button variant="link" className="px-0" asChild>
                  <Link href={recordHistoryHref(entry)}>{t("recordHistory", { kind: entry.entityType })}</Link>
                </Button>
              )}
            </div>
            {changed && (
              <CollapsibleContent>
                <AuditChange before={entry.before} after={entry.after} />
              </CollapsibleContent>
            )}
          </Collapsible>
        )}
      </ItemContent>
    </Item>
  );
}

/** The entries, newest first. `recordLinks` leads each to its record's history; a record's own history needs none. */
export function AuditEntries({ entries, recordLinks }: { entries: AuditLogEntry[]; recordLinks: boolean }) {
  const t = useTranslations("audit");
  return (
    <ItemGroup aria-label={t("entries")}>
      {entries.map((entry, index) => (
        <Fragment key={entry.id}>
          {index > 0 && <ItemSeparator />}
          <AuditEntry entry={entry} recordLink={recordLinks} />
        </Fragment>
      ))}
    </ItemGroup>
  );
}
