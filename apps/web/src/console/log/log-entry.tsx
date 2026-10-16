"use client";

// One platform log entry, readable: what was done (a sentence, or the action's own words for one the console doesn't
// know yet), who did it, the organization it concerns and what it was about, when, and, on request, what changed.
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Item, ItemContent } from "@/components/ui/item";
import { useStaff } from "../session/staff-context";
import { useInstantText } from "./instant";
import { isKnownAction } from "./log-actions";
import { changesOf } from "./log-changes";
import { LogOrganization, LogTarget } from "./log-target";
import type { LogNames } from "./use-log-names";

export function LogEntry({ entry, names }: { entry: PlatformLogEntry; names: LogNames }) {
  const t = useTranslations("consolePlatform.log");
  const viewer = useStaff();
  const instantText = useInstantText();
  const changesId = useId();
  const [showChanges, setShowChanges] = useState(false);
  const changes = changesOf(entry.before, entry.after);
  const what = isKnownAction(entry.action)
    ? t(`actions.${entry.action}`)
    : t("unknownAction", { action: entry.action });
  let who: string;
  if (entry.actorUserId === null) who = t("automatic");
  else if (entry.actorUserId === viewer.userId) who = t("you");
  else who = names.personName(entry.actorUserId) ?? t("platformStaff");

  return (
    <Item size="sm" role="listitem">
      <ItemContent>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-medium">{what}</span>
          <span className="numbers text-caption text-muted-foreground">{instantText(entry.occurredAt)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-label">
          <span className="script-leading">{who}</span>
          <LogOrganization entry={entry} names={names} />
          <LogTarget entry={entry} names={names} />
        </div>
        {changes.length > 0 && (
          <>
            <Button
              variant="ghost"
              className="-ml-4 self-start"
              aria-expanded={showChanges}
              aria-controls={changesId}
              onClick={() => {
                setShowChanges(!showChanges);
              }}
            >
              {showChanges ? t("hideChanges") : t("changes")}
            </Button>
            {showChanges && (
              <dl id={changesId} className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-caption">
                {changes.map((change) => (
                  <div key={change.field} className="flex flex-wrap items-center gap-x-2">
                    <dt className="numbers text-muted-foreground">{change.field}</dt>
                    <dd className="flex flex-wrap items-center gap-x-2">
                      {change.before !== null && <span className="numbers break-all">{change.before}</span>}
                      {change.before !== null && change.after !== null && (
                        <ArrowRightIcon role="img" aria-label={t("changedTo")} className="size-3.5 shrink-0" />
                      )}
                      {change.after !== null && <span className="numbers break-all">{change.after}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </ItemContent>
    </Item>
  );
}
