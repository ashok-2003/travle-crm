"use client";

// One platform log entry, readable: what was done (a sentence, or the action's own words for one the console doesn't
// know yet), who did it, the organization it concerns and what it was about, when, and, on request, what changed.
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Item, ItemContent } from "@/components/ui/item";
import { useStaff } from "../session/staff-context";
import { useInstantText } from "@/components/instant-text";
import { isKnownAction } from "./log-actions";
import { LogChanges } from "./log-changes-view";
import { LogOrganization, LogTarget } from "./log-target";
import type { LogNames } from "./use-log-names";

export function LogEntry({ entry, names }: { entry: PlatformLogEntry; names: LogNames }) {
  const t = useTranslations("consolePlatform.log");
  const viewer = useStaff();
  const instantText = useInstantText();
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
        <LogChanges entry={entry} names={names} />
      </ItemContent>
    </Item>
  );
}
