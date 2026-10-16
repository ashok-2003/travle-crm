"use client";

// The lead list on a phone (R44, DESIGN.md: below 768px a table becomes a divided list): each lead one link, the name
// (↺ Returning beside it) and the stage on its first line, the trip in one line and what's next under them. Names
// wrap rather than being cut off.
import type { LeadListItem } from "@travel-crm/contracts/crm";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { useMe } from "@/session/me-context";
import { NextStep } from "../next-step";
import { StageBadge } from "../stage-badge";
import { useTripLine } from "../trip-line";
import { leadHref, type ListFilters } from "./list-filters";
import { ReturningBadge } from "./returning-badge";

export function LeadRows({ leads, filters }: { leads: LeadListItem[]; filters: ListFilters }) {
  const t = useTranslations("leads.list");
  const tripLine = useTripLine();
  const { timeZone } = useMe().organization;
  return (
    <ItemGroup aria-label={t("leads")}>
      {leads.map((lead, index) => (
        <Fragment key={lead.id}>
          {index > 0 && <ItemSeparator />}
          <div role="listitem">
            <Item asChild size="sm">
              <Link href={leadHref(lead.id, filters)}>
                <ItemHeader className="items-start">
                  <ItemTitle className="flex-wrap">
                    <span className="script-leading">{lead.person.name}</span>
                    {lead.returning && <ReturningBadge />}
                  </ItemTitle>
                  <StageBadge stage={lead.stage} />
                </ItemHeader>
                <ItemContent>
                  <ItemDescription className="script-leading">{tripLine(lead.trip)}</ItemDescription>
                  <span className="text-label">
                    <NextStep next={lead.next} timeZone={timeZone} />
                  </span>
                </ItemContent>
              </Link>
            </Item>
          </div>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
