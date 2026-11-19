"use client";

// My tasks' tables, tab by tab (web revamp part 2, the spec's columns), over the things the api sends for each: the
// Customer (the person, leading to their lead, the stage under the name where the spec has it), the tab's own columns,
// and the buttons as icons: how to reach them, then the row's main move (Done and Snooze, or Mark contacted). A task on
// no lead has no one to name or call. Widths are fixed but for the text columns, which share what is left.
import type { LeadBrief, TodayItem } from "@travel-crm/contracts/today";
import { money } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CustomerCell } from "@/components/customer-cell";
import { TextLink } from "@/components/text-link";
import { ClampedText, type WorkColumn } from "@/components/work-table";
import { CallButton, WhatsAppButton } from "@/leads/contact-buttons";
import { useTripLine } from "@/leads/trip-line";
import { formatRupees } from "@/lib/format";
import { bookingRoute, leadRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { TaskActions } from "@/tasks/task-actions";
import { useItemWhen } from "./item-when";
import { MarkContactedButton } from "./mark-contacted-button";
import type { MyTasksSection } from "./use-today";
import { WhenMark } from "./when-mark";

type Cell = (item: TodayItem) => ReactNode;

export interface SectionColumns {
  columns: WorkColumn<TodayItem>[];
  actions: { header: string; width: number; cell: Cell };
}

/** The buttons column for so many icons: 32px each, 12px apart, inside the cell's 12px padding either side. */
const iconsWidth = (count: number) => count * 32 + (count - 1) * 12 + 24;

const leadOf = (item: TodayItem): LeadBrief | null => (item.kind === "departure" ? null : item.lead);

const muted = (text: string) => <span className="text-label text-muted-foreground script-leading">{text}</span>;

export function useSectionColumns(section: MyTasksSection): SectionColumns {
  const t = useTranslations("today");
  const tSources = useTranslations("leads.sources");
  const tripLine = useTripLine();
  const when = useItemWhen();
  const mayEdit = useHolds("leads:edit");

  const customer = (withStage: boolean): WorkColumn<TodayItem> => ({
    header: t("columns.customer"),
    width: 200,
    cell: (item) => {
      const lead = leadOf(item);
      if (lead === null) return muted(t("noLead"));
      return (
        <CustomerCell name={lead.personName} href={leadRoute(lead.id)} {...(withStage && { stage: lead.stage })} />
      );
    },
  });
  const whenColumn = (header: string, width: number): WorkColumn<TodayItem> => ({
    header,
    width,
    cell: (item) => {
      const { urgency, text } = when(item);
      return <WhenMark urgency={urgency}>{text}</WhenMark>;
    },
  });
  const trip: Cell = (item) => {
    const lead = leadOf(item);
    return lead && muted(tripLine(lead.trip));
  };
  const booking = (id: string, number: string) => (
    <TextLink inline href={bookingRoute(id)}>
      {t("item.openBooking", { number })}
    </TextLink>
  );
  const reach: Cell = (item) => {
    const lead = leadOf(item);
    const phone = lead?.phone ?? null;
    if (lead === null || phone === null) return null;
    return (
      <>
        <CallButton phone={phone} name={lead.personName} leadId={lead.id} compact />
        <WhatsAppButton phone={phone} name={lead.personName} leadId={lead.id} compact />
      </>
    );
  };

  switch (section) {
    case "overdue":
    case "due-today":
      return {
        columns: [
          customer(true),
          whenColumn(t("columns.due"), 168),
          { header: t("columns.task"), cell: (item) => item.kind === "task" && <ClampedText text={item.task.title} /> },
          {
            header: t("columns.details"),
            cell: (item) => (
              <div className="flex flex-col items-start gap-1">
                {trip(item)}
                {item.kind === "task" && item.booking !== null && booking(item.booking.id, item.booking.number)}
              </div>
            ),
          },
        ],
        actions: {
          header: t("columns.actions"),
          width: iconsWidth(4),
          cell: (item) => (
            <>
              {reach(item)}
              {item.kind === "task" && <TaskActions task={item.task} compact />}
            </>
          ),
        },
      };
    case "new-leads":
      return {
        columns: [
          customer(true),
          whenColumn(t("columns.waiting"), 120),
          {
            header: t("columns.source"),
            width: 150,
            cell: (item) => item.kind === "new-lead" && muted(tSources(item.lead.source)),
          },
          { header: t("columns.trip"), cell: trip },
        ],
        actions: {
          header: t("columns.actions"),
          width: iconsWidth(3),
          cell: (item) => (
            <>
              {reach(item)}
              {item.kind === "new-lead" && mayEdit && <MarkContactedButton lead={item.lead} />}
            </>
          ),
        },
      };
    case "payments-due":
      return {
        columns: [
          customer(false),
          {
            header: t("columns.amount"),
            width: 160,
            end: true,
            cell: (item) =>
              item.kind === "payment-due" && <span className="numbers">{formatRupees(money(item.amountPaise))}</span>,
          },
          whenColumn(t("columns.due"), 160),
        ],
        actions: { header: t("columns.actions"), width: iconsWidth(2), cell: reach },
      };
    case "trip-details":
      return {
        columns: [
          customer(false),
          whenColumn(t("columns.leaves"), 120),
          { header: t("columns.trip"), cell: trip },
          {
            header: t("columns.missing"),
            cell: (item) =>
              item.kind === "trip-details" && (
                <div className="flex flex-col items-start gap-1">
                  <span className="script-leading">
                    {t("item.tripDetails", { missing: item.missing, total: item.total })}
                  </span>
                  {booking(item.bookingId, item.number)}
                </div>
              ),
          },
        ],
        actions: { header: t("columns.actions"), width: iconsWidth(2), cell: reach },
      };
  }
}
