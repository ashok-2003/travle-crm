"use client";

// One row of the Follow-ups screen: the lead (to its page) and its stage, when the follow-up is due in its urgency's
// colour, what to do (and whether the AI added it), whose it is when everyone's show, the lead's last WhatsApp message
// with whether the 24-hour window is open, and what the AI did when it came due. Then how to reach them, Open chat,
// and Done, Snooze and Edit. Times are the agency's.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import type { PeopleNames } from "@travel-crm/contracts/crm";
import { BotIcon, PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { StatusBadge, StatusDot } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
import { CallButton, WhatsAppButton } from "@/leads/contact-buttons";
import { StageBadge } from "@/leads/stage-badge";
import { formatDayTime } from "@/lib/format";
import { elapsed } from "@/lib/relative-time";
import { inboxRoute, leadRoute } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { TaskActions } from "@/tasks/task-actions";
import { WhenMark } from "@/today/when-mark";
import { EditFollowUpDialog } from "./edit-follow-up-dialog";

export function FollowUpItem({
  row,
  people,
  showOwner,
}: {
  row: FollowUpRow;
  people: PeopleNames;
  showOwner: boolean;
}) {
  const t = useTranslations("tasks.followUps");
  const tNext = useTranslations("leads.next");
  const { timeZone } = useMe().organization;
  const now = useNow();
  const write = useWriteAccess();
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const due = new Date(row.dueAt);
  const ago = (at: string) => {
    const { unit, count } = elapsed(new Date(at), now);
    return tNext(`elapsed.${unit}`, { count });
  };
  const { whatsapp, ai, lead } = row;
  const owner = row.assigneeUserId === null ? t("unassigned") : (people[row.assigneeUserId] ?? t("formerMember"));
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <TextLink href={leadRoute(lead.id)}>{lead.name}</TextLink>
            <StageBadge stage={lead.stage} />
          </div>
          <WhenMark urgency={due < now ? "overdue" : "today"}>{formatDayTime(due, { timeZone, now })}</WhenMark>
        </div>
        <ItemDescription className="flex flex-wrap items-center gap-2 break-words script-leading text-foreground">
          {row.byAi && <StatusBadge tone="neutral">{t("byAi")}</StatusBadge>}
          {row.title}
        </ItemDescription>
        {showOwner && <ItemDescription>{t("owner", { name: owner })}</ItemDescription>}
        <ItemDescription className="break-words script-leading">
          {whatsapp === null ? (
            t("noChat")
          ) : (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <span className="inline-flex items-center gap-1.5">
                <StatusDot tone={whatsapp.windowOpen ? "good" : "neutral"} />
                {whatsapp.windowOpen ? t("windowOpen") : t("windowClosed")}
              </span>
              {whatsapp.lastAt !== null && whatsapp.lastFrom !== null && (
                <span>
                  {t("lastMessage", { from: t(`from.${whatsapp.lastFrom}`), ago: ago(whatsapp.lastAt) })}
                  {whatsapp.lastText !== null && ` “${whatsapp.lastText}”`}
                </span>
              )}
            </span>
          )}
        </ItemDescription>
        {ai !== null && (
          <ItemDescription className="inline-flex items-start gap-1.5 break-words script-leading">
            <BotIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t(`ai.${ai.outcome}`, { ago: ago(ai.at) })}
              {ai.text !== null && ` “${ai.text}”`}
            </span>
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions className="basis-full flex-col items-start gap-2 md:flex-row md:items-start">
        {lead.phone !== null && (
          <div className="flex flex-wrap gap-2">
            <CallButton phone={lead.phone} name={lead.name} leadId={lead.id} variant="outline" />
            <WhatsAppButton phone={lead.phone} name={lead.name} />
          </div>
        )}
        {whatsapp !== null && <TextLink href={inboxRoute(whatsapp.conversationId)}>{t("openChat")}</TextLink>}
        <div className="flex flex-wrap gap-2">
          <TaskActions task={{ id: row.taskId, title: row.title }} />
          <Button
            ref={editButton}
            variant="ghost"
            aria-label={t("editTask", { title: row.title })}
            disabled={!write.allowed}
            onClick={() => {
              setEditing(true);
            }}
          >
            <PencilIcon aria-hidden="true" />
            {t("edit")}
          </Button>
        </div>
        <EditFollowUpDialog row={row} open={editing} onOpenChange={setEditing} returnFocusTo={editButton} />
      </ItemActions>
    </Item>
  );
}
