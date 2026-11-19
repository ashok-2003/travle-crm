"use client";

// A lead on the pipeline board, compact (web revamp part 4): its name in ink, the whole card one link to its page; its
// trip when it has details; what's next on one line in its urgency's colour; its owner's initials in Everyone's view;
// and Move to in the same top-right corner on every card. On a computer it can also be dragged to another column, and
// lifts while it is (DESIGN.md Elevation: a shadow on what floats).
import type { LeadListItem, LeadStage } from "@travel-crm/contracts/crm";
import Link from "next/link";
import { memo, useState } from "react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { leadRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { NextStep } from "../next-step";
import { OwnerInitials } from "../owner-initials";
import { useTripDetails } from "../trip-line";
import { DRAGGED_LEAD, type DraggedLead } from "./dragged-lead";
import { MoveTo } from "./move-to";

/** Drawn again only when its own lead changes, not for a move elsewhere on the board. */
export const PipelineCard = memo(function PipelineCard({
  lead,
  owner,
  wide,
  onMove,
}: {
  lead: LeadListItem;
  /** In Everyone's view, where a card's owner may be anyone: their name (null for a former member's). */
  owner: string | null | undefined;
  /** Tablet-wide or more, where cards are dragged; a phone moves them with Move to alone. */
  wide: boolean;
  onMove: (lead: DraggedLead, stage: LeadStage) => void;
}) {
  const tripDetails = useTripDetails();
  const { timeZone } = useMe().organization;
  const edits = useHolds("leads:edit");
  const write = useWriteAccess("change");
  const [dragging, setDragging] = useState(false);
  const draggable = wide && edits && write.allowed;
  const trip = tripDetails(lead.trip);
  return (
    <Item
      variant="outline"
      size="sm"
      draggable={draggable}
      data-dragging={dragging || undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAGGED_LEAD, JSON.stringify({ id: lead.id, name: lead.person.name }));
        event.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => {
        setDragging(false);
      }}
      className={cn(
        "relative bg-card hover:bg-muted data-dragging:shadow-lg",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <ItemContent className="min-w-0 gap-0.5">
        {/* Clear of Move to in the corner; the lines under the name have the card's whole width. */}
        <ItemTitle className={cn("w-auto", edits && "pe-7")}>
          {/* Stretched over the card, so the whole card opens the lead; not draggable itself, so a drag takes the card. */}
          <Link
            href={leadRoute(lead.id)}
            draggable={false}
            className="script-leading font-semibold wrap-anywhere after:absolute after:inset-0 after:rounded-lg"
          >
            {lead.person.name}
          </Link>
        </ItemTitle>
        {trip !== null && <ItemDescription className="script-leading">{trip}</ItemDescription>}
        <div className="flex min-h-6 items-center gap-2 text-label">
          <span className="min-w-0 flex-1 truncate">
            <NextStep next={lead.next} timeZone={timeZone} />
          </span>
          {owner !== undefined && <OwnerInitials name={owner} />}
        </div>
      </ItemContent>
      {edits && (
        <ItemActions className="absolute top-1 right-1">
          <MoveTo lead={lead} wide={wide} onMove={onMove} />
        </ItemActions>
      )}
    </Item>
  );
});
