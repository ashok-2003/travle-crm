"use client";

// The lead list on a computer (R44): the registry Table from 768px, with the mockup's seven columns: the name (a link,
// ↺ Returning beside it) over the phone; the trip over its source; the stage; what's next; the owner (not for a
// salesperson, whose every lead is theirs); the budget over its basis; the day it came in. Numbers are mono and
// right-aligned; names wrap.
import type { LeadListItem, PeopleNames } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay, formatPhoneNumber } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { NextStep } from "../next-step";
import { OwnerBadge } from "../owner-badge";
import { StageBadge } from "../stage-badge";
import { useTripLine } from "../trip-line";
import { leadHref, type ListFilters } from "./list-filters";
import { ReturningBadge } from "./returning-badge";

const columns = ["name", "trip", "stage", "next", "owner", "budget", "added"] as const;
const numeric = new Set<string>(["budget", "added"]);

export function LeadsTable({
  leads,
  people,
  filters,
  showOwner,
}: {
  leads: LeadListItem[];
  people: PeopleNames;
  filters: ListFilters;
  /** False for a salesperson, who sees only their own leads. */
  showOwner: boolean;
}) {
  const t = useTranslations("leads");
  const tripLine = useTripLine();
  const { timeZone } = useMe().organization;
  const caption = (text: string) => <span className="text-caption text-muted-foreground">{text}</span>;
  return (
    <Table aria-label={t("list.leads")}>
      <TableHeader>
        <TableRow>
          {columns
            .filter((column) => showOwner || column !== "owner")
            .map((column) => (
              <TableHead key={column} scope="col" className={numeric.has(column) ? "text-right" : undefined}>
                {t(`list.columns.${column}`)}
              </TableHead>
            ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <TextLink inline href={leadHref(lead.id, filters)}>
                    <span className="script-leading">{lead.person.name}</span>
                  </TextLink>
                  {lead.returning && <ReturningBadge />}
                </div>
                {lead.person.phone && (
                  <span className="numbers text-caption text-muted-foreground">
                    {formatPhoneNumber(lead.person.phone)}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col gap-0.5">
                <span className="script-leading">{tripLine(lead.trip)}</span>
                {caption(t(`sources.${lead.source}`))}
              </div>
            </TableCell>
            <TableCell>
              <StageBadge stage={lead.stage} />
            </TableCell>
            <TableCell className="whitespace-normal text-label">
              <NextStep next={lead.next} timeZone={timeZone} />
            </TableCell>
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
            <TableCell className="numbers text-right">{formatDay(new Date(lead.createdAt), { timeZone })}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
