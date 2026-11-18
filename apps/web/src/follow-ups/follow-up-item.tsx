"use client";

// One row of the Follow-ups screen: the lead (to its page) and its stage, when the follow-up is due in its urgency's
// colour, what to do, whose it is when everyone's show, the customer's last WhatsApp message, and one next move worked out
// from the chat and what the AI did (next-move.ts). Then how to reach them, Open chat, and Done, Snooze and Edit.
// Times are the agency's.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import type { PeopleNames } from "@travel-crm/contracts/crm";
import { PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
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
import { nextMove } from "./next-move";
import { EditFollowUpDialog } from "./edit-follow-up-dialog";

export function FollowUpItem({
  row,
  people,
  showOwner,
  onDone,
}: {
  row: FollowUpRow;
  people: PeopleNames;
  showOwner: boolean;
  /** Called once this follow-up is done, from the screen, which outlives the row. */
  onDone: (row: FollowUpRow) => void;
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
  const { whatsapp, lead } = row;
  const move = nextMove(row);
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
        <ItemDescription className="break-words script-leading text-foreground">{row.title}</ItemDescription>
        {showOwner && <ItemDescription>{t("owner", { name: owner })}</ItemDescription>}
        {whatsapp?.lastAt != null && whatsapp.lastFrom !== null && (
          <ItemDescription className="break-words script-leading">
            {t("lastMessage", { from: t(`from.${whatsapp.lastFrom}`), ago: ago(whatsapp.lastAt) })}
            {whatsapp.lastText !== null && ` “${whatsapp.lastText}”`}
          </ItemDescription>
        )}
        {move !== null && (
          <ItemDescription className="font-medium text-foreground">{t(`nextMove.${move}`)}</ItemDescription>
        )}
      </ItemContent>
      <ItemActions className="basis-full flex-wrap items-start">
        {lead.phone !== null && (
          <div className="flex flex-wrap gap-2">
            <CallButton phone={lead.phone} name={lead.name} leadId={lead.id} variant="outline" compact />
            <WhatsAppButton phone={lead.phone} name={lead.name} leadId={lead.id} compact />
          </div>
        )}
        {whatsapp !== null && <TextLink href={inboxRoute(whatsapp.conversationId)}>{t("openChat")}</TextLink>}
        <div className="flex flex-wrap gap-2">
          <TaskActions
            task={{ id: row.taskId, title: row.title }}
            onDone={() => {
              onDone(row);
            }}
          />
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
