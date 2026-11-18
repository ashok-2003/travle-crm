"use client";

// One row of the Follow-ups screen: the lead (to its page) and its stage, when the follow-up is due in its urgency's
// colour, what to do, whose it is when everyone's show, the customer's last WhatsApp message, and one next move worked out
// from the chat and what the AI did (next-move.ts). Then how to reach them, and Done, Snooze and Edit. Line 2 is muted and
// one line; the WhatsApp button opens the chat.
// Times are the agency's.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import type { PeopleNames } from "@travel-crm/contracts/crm";
import { PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { DenseRow } from "@/components/dense-row";
import { CallButton, Tipped, WhatsAppButton } from "@/leads/contact-buttons";
import { StageBadge } from "@/leads/stage-badge";
import { formatDayTime } from "@/lib/format";
import { elapsed } from "@/lib/relative-time";
import { leadRoute } from "@/lib/routes";
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
  // Line 2, muted and on one line: the next move when there is one, else the customer's last message.
  const lastMessage =
    whatsapp?.lastAt != null && whatsapp.lastFrom !== null
      ? t("lastMessage", { from: t(`from.${whatsapp.lastFrom}`), ago: ago(whatsapp.lastAt) }) +
        (whatsapp.lastText !== null ? ` “${whatsapp.lastText}”` : "")
      : null;
  const detail = [showOwner ? t("owner", { name: owner }) : null, move !== null ? t(`nextMove.${move}`) : lastMessage]
    .filter((part): part is string => part !== null)
    .join(" · ");
  return (
    <>
      <DenseRow
        line={
          <>
            <span className="shrink-0 xl:[&>a]:min-h-0">
              <TextLink href={leadRoute(lead.id)}>{lead.name}</TextLink>
            </span>
            <StageBadge stage={lead.stage} />
            <span title={row.title} className="min-w-0 text-sm script-leading md:truncate">
              {row.title}
            </span>
          </>
        }
        when={<WhenMark urgency={due < now ? "overdue" : "today"}>{formatDayTime(due, { timeZone, now })}</WhenMark>}
        detail={detail}
        actions={
          <>
            {lead.phone !== null && (
              <div className="flex flex-wrap gap-2">
                <CallButton phone={lead.phone} name={lead.name} leadId={lead.id} variant="outline" compact />
                <WhatsAppButton phone={lead.phone} name={lead.name} leadId={lead.id} compact />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <TaskActions
                task={{ id: row.taskId, title: row.title }}
                compact
                onDone={() => {
                  onDone(row);
                }}
              />
              <Tipped compact label={t("editTask", { title: row.title })}>
                <Button
                  ref={editButton}
                  variant="outline"
                  size="icon"
                  aria-label={t("editTask", { title: row.title })}
                  disabled={!write.allowed}
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  <PencilIcon aria-hidden="true" />
                </Button>
              </Tipped>
            </div>
          </>
        }
      />
      <EditFollowUpDialog row={row} open={editing} onOpenChange={setEditing} returnFocusTo={editButton} />
    </>
  );
}
