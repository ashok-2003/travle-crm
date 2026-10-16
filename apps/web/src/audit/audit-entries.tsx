"use client";

// The audit log's entries (DESIGN.md section 6): a list of items at every width. Each says what happened, who did it,
// when in the organization's zone and from where, and leads to the record's whole history; its title opens what
// changed below it (the registry's Collapsible), in words (audit-words.ts).
import type { AuditLogEntry } from "@travel-crm/contracts/audit";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { AuditChange, hasChange } from "@/components/audit-change";
import { useAuditWords } from "./audit-words";
import { recordHistoryHref } from "./record-filter";
import { TextLink } from "@/components/text-link";

function AuditEntry({ entry, recordLink }: { entry: AuditLogEntry; recordLink: boolean }) {
  const t = useTranslations("audit");
  const words = useAuditWords();
  const { timeZone } = useMe().organization;
  const instant = new Date(entry.occurredAt);
  const changed = hasChange(entry.before, entry.after);
  const sentence = words.action(entry.action);
  return (
    <Item size="sm" role="listitem">
      <Collapsible asChild>
        <ItemContent>
          <ItemTitle className="w-full">
            {changed ? (
              <CollapsibleTrigger
                aria-label={t("change.open", { action: sentence })}
                className="group/change flex min-h-11 w-full items-center justify-between gap-2 text-left"
              >
                {sentence}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 motion-safe:transition-transform motion-safe:ease-out group-data-[state=open]/change:rotate-180"
                />
              </CollapsibleTrigger>
            ) : (
              sentence
            )}
          </ItemTitle>
          <ItemDescription>
            <span className="break-words script-leading">{words.actor(entry.actor)}</span> ·{" "}
            <time dateTime={entry.occurredAt}>{formatDayTime(instant, { timeZone })}</time> ·{" "}
            {words.source(entry.source)}
          </ItemDescription>
          {recordLink && (
            <TextLink href={recordHistoryHref(entry)}>{t("recordHistory", { kind: entry.entityType })}</TextLink>
          )}
          {changed && (
            <CollapsibleContent>
              <AuditChange before={entry.before} after={entry.after} fieldName={words.field} valueText={words.value} />
            </CollapsibleContent>
          )}
        </ItemContent>
      </Collapsible>
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
