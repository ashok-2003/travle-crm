"use client";

// One stage of the pipeline board, in a faint tint of its stage's colour: its name with its dot and count (on a wider
// screen; on a phone the stage's chip says them), then its leads newest first, a page at a time, each a card that can
// be dragged to another column (a computer) or moved with its Move to (anywhere, and from the keyboard). A column takes
// a dropped card and moves that lead here.
import { useTranslations } from "next-intl";
import { memo, useRef, useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLeads } from "../list/use-leads";
import { StageDot } from "../stage-badge";
import { columnInput, type BoardStage, type BoardView } from "./board-cache";
import { DRAGGED_LEAD, draggedLeadOf } from "./dragged-lead";
import { useTakeFocus, type FocusAfterMove, type OnMove } from "./move-to";
import { PipelineCard } from "./pipeline-card";

/**
 * Each column's tint (owner, 2026-11-20), the way Home's day cards are tinted: its stage's fill mixed into the card in
 * oklab (no hue drift), at the share that makes the five equally faint (the sky and the amber are the strongest, so
 * the least of them); the column's edge, its cards' edges and its muted words take the stage's dark ink, its title the
 * ink itself. The cards stay the card's colour on top. Written out in full so Tailwind finds every class.
 */
const tints: Record<BoardStage, string> = {
  new: "bg-[color-mix(in_oklab,var(--brand-stage-new-fill)_30%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-stage-new-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-stage-new-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-stage-new-ink)",
  contacted:
    "bg-[color-mix(in_oklab,var(--brand-stage-contacted-fill)_40%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-stage-contacted-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-stage-contacted-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-stage-contacted-ink)",
  quote_sent:
    "bg-[color-mix(in_oklab,var(--brand-status-attention-fill)_35%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-status-attention-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-status-attention-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-status-attention-ink)",
  booking_requested:
    "bg-[color-mix(in_oklab,var(--brand-stage-booking-requested-fill)_45%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-stage-booking-requested-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-stage-booking-requested-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-stage-booking-requested-ink)",
  won: "bg-[color-mix(in_oklab,var(--brand-status-good-fill)_45%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-status-good-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-status-good-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-status-good-ink)",
};

/** Drawn again only when its own leads or count change. */
export const StageColumn = memo(function StageColumn({
  stage,
  view,
  wide,
  count,
  focus,
  onFocused,
  onMove,
}: {
  stage: BoardStage;
  view: BoardView;
  /** Tablet-wide or more: the board's five columns, whose cards are dragged between them. */
  wide: boolean;
  /** The stage's open leads, from leads.counts; undefined for Won or while they load. */
  count: number | undefined;
  /** Where the focus goes after a keyboard move, when it is in this column: a card's Move to, or the column itself. */
  focus: FocusAfterMove | null;
  onFocused: () => void;
  onMove: OnMove;
}) {
  const t = useTranslations("leads");
  const leads = useLeads(columnInput(view, stage));
  const [dropping, setDropping] = useState(false);
  const self = useRef<HTMLDivElement>(null);
  useTakeFocus(focus?.on === "column" ? onFocused : null, self);
  const shown = leads.items ?? [];
  return (
    <Card
      ref={self}
      tabIndex={-1}
      role="group"
      aria-label={t(`stages.${stage}`)}
      className={cn(tints[stage], wide && "snap-start")}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAGGED_LEAD)) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        // Passing over one of its own cards isn't leaving: the hint would flicker and the cards jump under it.
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const dropped = draggedLeadOf(event.dataTransfer.getData(DRAGGED_LEAD));
        if (dropped) onMove(dropped, stage);
      }}
    >
      {wide && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StageDot stage={stage} />
            {t(`stages.${stage}`)}
            <span className="ml-auto font-mono text-number font-normal text-muted-foreground tabular-nums">
              {formatCount(count ?? shown.length)}
            </span>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="relative flex flex-1 flex-col gap-2">
        {dropping && (
          // Over the cards, not among them: nothing moves under the pointer, so the drop lands where it was aimed.
          <p className="pointer-events-none absolute inset-x-2 inset-y-0 z-(--z-sticky) rounded-md bg-action-tint px-3 py-2 text-label text-action-pressed">
            {t("pipeline.dropHere", { stage: t(`stages.${stage}`) })}
          </p>
        )}
        {leads.items === undefined ? (
          leads.isError ? (
            <LoadFailedAlert
              message={t("pipeline.loadFailed")}
              error={leads.error}
              onRetry={() => void leads.refetch()}
            />
          ) : (
            <LoadingRows rows={3} shape="twoLines" />
          )
        ) : shown.length === 0 ? (
          <p className="text-label text-muted-foreground">{t("pipeline.empty")}</p>
        ) : (
          shown.map((lead) => (
            <PipelineCard
              key={lead.id}
              lead={lead}
              owner={
                view === "everyone" && lead.ownerUserId !== null ? (leads.people[lead.ownerUserId] ?? null) : undefined
              }
              wide={wide}
              focus={focus?.on === "card" && focus.leadId === lead.id ? onFocused : null}
              onMove={onMove}
            />
          ))
        )}
        <ShowMoreButton pages={leads} label={t("pipeline.showMore")} />
      </CardContent>
    </Card>
  );
});
