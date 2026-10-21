"use client";

// A lead on the pipeline board: its name (a link to its page), its trip, its owner and what's next, and Move to, the
// way to change its stage from the keyboard or on a phone. On a computer it can also be dragged to another column.
import { leadStages, type LeadListItem, type LeadStage, type PeopleNames } from "@travel-crm/contracts/crm";
import { ArrowRightLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { leadRoute } from "@/lib/routes";
import { useHolds, useMe } from "@/session/me-context";
import { NextStep } from "../next-step";
import { OwnerBadge } from "../owner-badge";
import { StageDot } from "../stage-badge";
import { useTripLine } from "../trip-line";
import { DRAGGED_LEAD } from "./dragged-lead";

export function PipelineCard({
  lead,
  owners,
  onMove,
}: {
  lead: LeadListItem;
  owners: PeopleNames;
  onMove: (lead: Pick<LeadListItem, "id" | "person">, stage: LeadStage) => void;
}) {
  const t = useTranslations("leads");
  const tripLine = useTripLine();
  const { timeZone } = useMe().organization;
  const edits = useHolds("leads:edit");
  return (
    <Item
      variant="outline"
      size="sm"
      draggable={edits}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAGGED_LEAD, JSON.stringify({ id: lead.id, name: lead.person.name }));
        event.dataTransfer.effectAllowed = "move";
      }}
      className={edits ? "cursor-grab active:cursor-grabbing" : undefined}
    >
      <ItemContent className="gap-1">
        <ItemTitle>
          <TextLink inline href={leadRoute(lead.id)}>
            <span className="script-leading">{lead.person.name}</span>
          </TextLink>
        </ItemTitle>
        <ItemDescription className="script-leading">{tripLine(lead.trip)}</ItemDescription>
        <div className="flex flex-wrap items-center gap-2 text-label">
          {lead.ownerUserId !== null && <OwnerBadge name={owners[lead.ownerUserId] ?? null} />}
          <NextStep next={lead.next} timeZone={timeZone} />
        </div>
      </ItemContent>
      {edits && (
        <ItemActions className="self-start">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("pipeline.moveTo", { name: lead.person.name })}>
                <ArrowRightLeftIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("pipeline.moveTo", { name: lead.person.name })}</DropdownMenuLabel>
              {leadStages
                .filter((stage) => stage !== lead.stage)
                .map((stage) => (
                  <DropdownMenuItem
                    key={stage}
                    onSelect={() => {
                      onMove(lead, stage);
                    }}
                  >
                    <StageDot stage={stage} />
                    {t(`stages.${stage}`)}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      )}
    </Item>
  );
}
