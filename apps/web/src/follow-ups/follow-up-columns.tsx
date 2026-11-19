"use client";

// Follow-ups as a table (web revamp part 2): the customer (to their lead) with the stage under the name, the remarks
// (what to do), the next step (one move worked out from the chat and what the AI did, next-move.ts, else the customer's
// last WhatsApp message), when it is due in its urgency's colour, whose it is when everyone's show, then the icons: how
// to reach them, and Done, Snooze and Edit. Done goes to the screen, which asks when the next one is. Times are the
// agency's.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import type { PeopleNames } from "@travel-crm/contracts/crm";
import { PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { CustomerCell } from "@/components/customer-cell";
import { IconButton } from "@/components/icon-button";
import { ClampedText, type WorkColumn } from "@/components/work-table";
import { CallButton, WhatsAppButton } from "@/leads/contact-buttons";
import { formatDayTime } from "@/lib/format";
import { elapsed } from "@/lib/relative-time";
import { leadRoute } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { TaskActions } from "@/tasks/task-actions";
import { WhenMark } from "@/today/when-mark";
import { EditFollowUpDialog } from "./edit-follow-up-dialog";
import { nextMove } from "./next-move";

/** Call, WhatsApp, Done, Snooze and Edit: 32px each, 12px apart, inside the cell's 12px padding either side. */
const buttonsWidth = 5 * 32 + 4 * 12 + 24;

function EditButton({ row }: { row: FollowUpRow }) {
  const t = useTranslations("tasks.followUps");
  const write = useWriteAccess();
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton
        ref={button}
        aria-label={t("editTask", { title: row.title })}
        disabled={!write.allowed}
        onClick={() => {
          setEditing(true);
        }}
      >
        <PencilIcon aria-hidden="true" />
      </IconButton>
      <EditFollowUpDialog row={row} open={editing} onOpenChange={setEditing} returnFocusTo={button} />
    </>
  );
}

export function useFollowUpColumns({
  showOwner,
  onDone,
}: {
  showOwner: boolean;
  /** Called once a follow-up is done, from the screen, which outlives the row. */
  onDone: (row: FollowUpRow) => void;
}): (people: PeopleNames) => {
  columns: WorkColumn<FollowUpRow>[];
  actions: { header: string; width: number; cell: (row: FollowUpRow) => ReactNode };
} {
  const t = useTranslations("tasks.followUps");
  const tNext = useTranslations("leads.next");
  const { timeZone } = useMe().organization;
  const now = useNow();
  const nextStep = (row: FollowUpRow) => {
    const move = nextMove(row);
    if (move !== null) return <ClampedText text={t(`nextMove.${move}`)} />;
    const { whatsapp } = row;
    if (whatsapp?.lastAt == null || whatsapp.lastFrom === null) return null;
    const { unit, count } = elapsed(new Date(whatsapp.lastAt), now);
    const said = t("lastMessage", { from: t(`from.${whatsapp.lastFrom}`), ago: tNext(`elapsed.${unit}`, { count }) });
    return (
      <div className="text-muted-foreground">
        <ClampedText text={whatsapp.lastText === null ? said : `${said} “${whatsapp.lastText}”`} />
      </div>
    );
  };
  return (people) => ({
    columns: [
      {
        header: t("columns.customer"),
        width: 200,
        cell: (row) => <CustomerCell name={row.lead.name} href={leadRoute(row.lead.id)} stage={row.lead.stage} />,
      },
      { header: t("columns.remarks"), cell: (row) => <ClampedText text={row.title} /> },
      { header: t("columns.nextStep"), cell: nextStep },
      {
        header: t("columns.due"),
        width: 184,
        cell: (row) => {
          const due = new Date(row.dueAt);
          return <WhenMark urgency={due < now ? "overdue" : "today"}>{formatDayTime(due, { timeZone, now })}</WhenMark>;
        },
      },
      ...(showOwner
        ? [
            {
              header: t("columns.owner"),
              width: 140,
              cell: (row: FollowUpRow) =>
                row.assigneeUserId === null ? t("unassigned") : (people[row.assigneeUserId] ?? t("formerMember")),
            },
          ]
        : []),
    ],
    actions: {
      header: t("columns.actions"),
      width: buttonsWidth,
      cell: (row) => (
        <>
          {row.lead.phone !== null && (
            <>
              <CallButton phone={row.lead.phone} name={row.lead.name} leadId={row.lead.id} compact />
              <WhatsAppButton phone={row.lead.phone} name={row.lead.name} leadId={row.lead.id} compact />
            </>
          )}
          <TaskActions
            task={{ id: row.taskId, title: row.title }}
            compact
            onDone={() => {
              onDone(row);
            }}
          />
          <EditButton row={row} />
        </>
      ),
    },
  });
}
