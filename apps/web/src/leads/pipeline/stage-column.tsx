"use client";

// One stage of the pipeline board: its name with its dot and count, then its leads newest first, a page at a time,
// each a card that can be dragged to another column (a computer) or moved with its Move to menu (anywhere, and from
// the keyboard). A column takes a dropped card and moves that lead here.
import type { LeadListItem, LeadStage } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { useLeads } from "../list/use-leads";
import { StageDot } from "../stage-badge";
import { DRAGGED_LEAD, draggedLeadOf } from "./dragged-lead";
import { PipelineCard } from "./pipeline-card";

export function StageColumn({
  stage,
  view,
  count,
  onMove,
}: {
  stage: LeadStage;
  view: "mine" | "everyone";
  /** The stage's open leads, from leads.counts; undefined for a closed stage or while they load. */
  count: number | undefined;
  onMove: (lead: Pick<LeadListItem, "id" | "person">, stage: LeadStage) => void;
}) {
  const t = useTranslations("leads");
  const leads = useLeads({ view, stage, limit: 20 });
  const [dropping, setDropping] = useState(false);
  const shown = leads.items ?? [];
  return (
    <Card
      role="group"
      aria-label={t(`stages.${stage}`)}
      className="w-72 shrink-0 snap-start"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAGGED_LEAD)) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => {
        setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const dropped = draggedLeadOf(event.dataTransfer.getData(DRAGGED_LEAD));
        if (dropped) onMove({ id: dropped.id, person: { name: dropped.name, phone: null } }, stage);
      }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StageDot stage={stage} />
          {t(`stages.${stage}`)}
          <span className="ml-auto font-mono text-number font-normal text-muted-foreground tabular-nums">
            {formatCount(count ?? shown.length)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {dropping && (
          <p className="rounded-md bg-action-tint px-3 py-2 text-label text-action-pressed">
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
          shown.map((lead) => <PipelineCard key={lead.id} lead={lead} owners={leads.people} onMove={onMove} />)
        )}
        <ShowMoreButton pages={leads} label={t("pipeline.showMore")} />
      </CardContent>
    </Card>
  );
}
