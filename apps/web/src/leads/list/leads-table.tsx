"use client";

// The lead list on a computer (R44): the registry Table from 768px, with the mockup's seven columns: the name (a link,
// ↺ Returning beside it) over the phone; the trip over its source; the stage; what's next; the owner (not for a
// salesperson, whose every lead is theirs); the budget over its basis; the day it came in. Numbers are mono and
// right-aligned; names wrap. With a selection (release C), a first column of checkboxes chooses leads for a bulk change.
// At every width (web revamp part 3) the columns keep their widths and the page never scrolls sideways. Where the table
// itself is narrower than its seven columns (a laptop, a tablet beside the sidebar) it folds as the phone's list does:
// the trip under the name and what's next under the stage. Narrower still (a tablet), it scrolls sideways inside its own
// box with the checkboxes and the name pinned at the left (DESIGN.md: Tables), the owner, budget and day off to the
// right, the least needed.
import type { LeadListItem, PeopleNames } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { rupees } from "@/components/forms/money-field";
import { TextLink } from "@/components/text-link";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pinnedCell } from "@/components/work-table";
import { formatDay, formatPhoneNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { NextStep } from "../next-step";
import { AiFilledMark } from "@/ai/ai-filled-mark";
import { OwnerBadge } from "../owner-badge";
import { StageBadge } from "../stage-badge";
import { useTripLine } from "../trip-line";
import type { LeadSelection } from "./bulk/use-lead-selection";
import { leadHref, type FiltersToShow } from "./list-filters";
import { ReturningBadge } from "./returning-badge";

const columns = ["name", "trip", "stage", "next", "owner", "budget", "added"] as const;
type Column = (typeof columns)[number];
const numeric = new Set<string>(["budget", "added"]);

/**
 * The fixed columns' widths in px, each its widest content and the cell's padding: "Booking requested", a name in the
 * owner's badge, "₹1,25,00,000", "16 Oct". The text columns share the rest.
 */
const widths: Partial<Record<Column, number>> = { stage: 160, owner: 112, budget: 128, added: 84 };
const checkboxWidth = 44;
/** The least a text column gets: each of three when unfolded; the name over its trip, alone, when folded. */
const textMinimum = 144;
const foldedNameMinimum = 180;

// The seven columns need 60rem (960px) with the checkboxes and the owner: below that the table folds. A column the fold
// takes is hidden, and its words show under the column it folds into.
const foldedColumns = new Set<Column>(["trip", "next"]);
const unfoldedOnly = "hidden @min-[60rem]:table-cell";
const foldedOnly = "@min-[60rem]:hidden";

/** The table's columns: Owner only for whoever sees others' leads. Its skeleton draws as many. */
export const tableColumns = (showOwner: boolean) => columns.filter((column) => showOwner || column !== "owner");

export function LeadsTable({
  leads,
  people,
  filters,
  showOwner,
  selection,
}: {
  leads: LeadListItem[];
  people: PeopleNames;
  /** The list's filters and page, which each row's link carries for its way back. */
  filters: FiltersToShow;
  /** False for a salesperson, who sees only their own leads. */
  showOwner: boolean;
  /** For whoever may change leads: the leads chosen for a bulk change. */
  selection?: LeadSelection;
}) {
  const t = useTranslations("leads");
  const tripLine = useTripLine();
  const { timeZone } = useMe().organization;
  const caption = (text: string) => <span className="text-caption text-muted-foreground">{text}</span>;
  const shown = tableColumns(showOwner);
  const fixed = shown.reduce((sum, column) => sum + (widths[column] ?? 0), selection ? checkboxWidth : 0);
  // Below its least width the table scrolls inside the registry's container rather than squeezing its columns.
  const least = {
    "--folded": `${String(fixed + foldedNameMinimum)}px`,
    "--unfolded": `${String(fixed + 3 * textMinimum)}px`,
  };
  // The checkboxes and the name stay at the left while the rest scrolls under them.
  const nameLeft = selection ? "left-11" : "left-0";
  return (
    <div className="@container">
      <Table
        aria-label={t("list.leads")}
        className="table-fixed min-w-(--folded) @min-[60rem]:min-w-(--unfolded)"
        style={least as CSSProperties}
      >
        <TableHeader>
          <TableRow>
            {selection && (
              <TableHead scope="col" className={cn("sticky left-0 z-(--z-sticky) w-11", pinnedCell)}>
                <Checkbox
                  aria-label={t("bulk.chooseAll")}
                  checked={leads.length > 0 && leads.every((lead) => selection.chosen.has(lead.id))}
                  onCheckedChange={() => {
                    selection.toggleAll(leads.map((lead) => lead.id));
                  }}
                />
              </TableHead>
            )}
            {shown.map((column) => (
              <TableHead
                key={column}
                scope="col"
                style={widths[column] === undefined ? undefined : { width: widths[column] }}
                className={cn(
                  numeric.has(column) && "text-right",
                  foldedColumns.has(column) && unfoldedOnly,
                  column === "name" && cn("sticky z-(--z-sticky)", nameLeft, pinnedCell),
                )}
              >
                {t(`list.columns.${column}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const trip = tripLine(lead.trip);
            const source = t(`sources.${lead.source}`);
            const next = <NextStep next={lead.next} timeZone={timeZone} />;
            return (
              <TableRow key={lead.id} data-state={selection?.chosen.has(lead.id) ? "selected" : undefined}>
                {selection && (
                  <TableCell className={cn("sticky left-0", pinnedCell)}>
                    <Checkbox
                      aria-label={t("bulk.choose", { name: lead.person.name })}
                      checked={selection.chosen.has(lead.id)}
                      onCheckedChange={() => {
                        selection.toggle(lead.id);
                      }}
                    />
                  </TableCell>
                )}
                <TableCell className={cn("sticky whitespace-normal wrap-anywhere", nameLeft, pinnedCell)}>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {/* 44px to touch on a tablet; from a laptop up, as tall as its words (as part 2's rows). */}
                      <span className="lg:[&>a]:min-h-0">
                        <TextLink href={leadHref(lead.id, filters)}>
                          <span className="script-leading">{lead.person.name}</span>
                        </TextLink>
                      </span>
                      {lead.aiFilled && <AiFilledMark />}
                      {lead.returning && <ReturningBadge />}
                    </div>
                    {lead.person.phone && (
                      <span className="numbers text-caption text-muted-foreground">
                        {formatPhoneNumber(lead.person.phone)}
                      </span>
                    )}
                    <span className={cn("script-leading text-label text-muted-foreground", foldedOnly)}>
                      {t("list.tripAndSource", { trip, source })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className={cn("whitespace-normal wrap-anywhere", unfoldedOnly)}>
                  <div className="flex flex-col gap-0.5">
                    <span className="script-leading">{trip}</span>
                    {caption(source)}
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col items-start gap-1">
                    <StageBadge stage={lead.stage} />
                    <span className={cn("text-label", foldedOnly)}>{next}</span>
                  </div>
                </TableCell>
                <TableCell className={cn("whitespace-normal text-label", unfoldedOnly)}>{next}</TableCell>
                {showOwner && (
                  <TableCell className="whitespace-normal">
                    {lead.ownerUserId === null ? (
                      caption(t("list.unassigned"))
                    ) : (
                      <OwnerBadge name={people[lead.ownerUserId] ?? null} />
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  {lead.budget ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="numbers">{rupees(lead.budget.amount.amountPaise)}</span>
                      {caption(t(`budgetBasis.${lead.budget.basis}`))}
                    </div>
                  ) : (
                    caption(t("list.noBudget"))
                  )}
                </TableCell>
                <TableCell className="numbers text-right whitespace-normal">
                  {formatDay(new Date(lead.createdAt), { timeZone })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
