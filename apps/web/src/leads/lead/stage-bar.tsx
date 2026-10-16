"use client";

// A lead's stage (spec 3.4, R30, R31, P2): the bar New → Contacted → Quote sent → Booking requested → Won, five 44px
// steps each over its segment of Progress, filled up to the current one, which is marked as the step. Tapping another
// moves the lead there, forwards or back (Won is on the bar, so a won lead moves freely). A Lost or Not a lead lead
// shows its badge and Reopen in place of the bar, which returns it to the open stage it had before. Someone who can't
// edit leads sees the stage only; while the subscription refuses changes the steps are off and say why.
import { stageBarStages, type LeadDetail, type LeadStage } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { StageBadge } from "../stage-badge";
import { useMoveStage, useReopenLead } from "./use-lead";

const onBar = (stage: LeadStage) => (stageBarStages as readonly string[]).includes(stage);

export function StageBar({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const canEdit = useHolds("leads:edit");
  const write = useWriteAccess("change");
  const hintId = useId();
  const move = useMoveStage();
  const reopen = useReopenLead();
  const described = write.hint === null ? undefined : hintId;
  const changeable = canEdit && write.allowed;

  if (!onBar(lead.stage)) {
    return (
      <section aria-label={t("lead.stage")} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StageBadge stage={lead.stage} />
          {canEdit && (
            <p className="text-muted-foreground">
              {t("lead.reopenReturns", { stage: t(`stages.${lead.reopenStage ?? "new"}`) })}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              className="self-start"
              aria-describedby={described}
              disabled={!changeable || reopen.isPending}
              onClick={() => {
                reopen.mutate({ leadId: lead.id });
              }}
            >
              {reopen.isPending && <Spinner />}
              {t("lead.reopen")}
            </Button>
            <WriteHint id={hintId} hint={write.hint} />
          </div>
        )}
      </section>
    );
  }

  const current = stageBarStages.findIndex((stage) => stage === lead.stage);
  return (
    <section aria-label={t("lead.stage")} className="flex flex-col gap-2">
      <ol className="grid grid-cols-5 gap-1">
        {stageBarStages.map((stage, index) => (
          <li key={stage} className="flex min-w-0 flex-col gap-1.5">
            <Progress value={index <= current ? 100 : 0} aria-hidden="true" />
            {stage === lead.stage || !canEdit ? (
              <span
                aria-current={stage === lead.stage ? "step" : undefined}
                className={
                  stage === lead.stage
                    ? "min-h-11 text-caption font-semibold"
                    : "min-h-11 text-caption text-muted-foreground"
                }
              >
                {t(`stages.${stage}`)}
              </span>
            ) : (
              <Button
                variant="ghost"
                className="h-auto min-h-11 items-start justify-start px-0 py-0 text-left text-caption font-normal whitespace-normal"
                aria-describedby={described}
                disabled={!write.allowed || move.isPending}
                onClick={() => {
                  move.mutate({ leadId: lead.id, stage });
                }}
              >
                {t(`stages.${stage}`)}
              </Button>
            )}
          </li>
        ))}
      </ol>
      {canEdit && <p className="text-caption text-muted-foreground">{t("lead.tapToMove")}</p>}
      <WriteHint id={hintId} hint={canEdit ? write.hint : null} />
    </section>
  );
}
