"use client";

// A lead's stage (spec 3.4, R30, R31, P2; DESIGN.md "Stage bar"): the stepper New → Contacted → Quote sent → Booking
// requested → Won, five 44px steps, each one target over its segment and its word, so hover and focus sit on the whole
// stage. The current stage's segment is filled in its stage colour (Won's in status green: done) and marked as the
// step; earlier stages show a lighter tint of theirs and, wider than a phone, a check; later ones are grey. Words are
// ink, not link blue.
// Choosing another step moves the lead there, forwards or back (Won is on the bar, so a won lead moves freely). A Lost
// or Not a lead lead shows its badge and Reopen in place of the bar, which returns it to the open stage it had before.
// The section is named with the current stage and each step says where it moves the lead, for screen readers. After a
// move or a Reopen, whose button is then gone, the focus goes to the new current stage rather than dropping to the
// page. A refusal shows its sentence in the bar until the next tap. Someone who can't edit leads sees the stage only;
// while the subscription refuses changes the steps are off and say why.
import { stageBarStages, type LeadDetail, type LeadStage } from "@travel-crm/contracts/crm";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { StageBadge, stageTones } from "../stage-badge";
import { useMoveStage, useReopenLead } from "./use-lead";

const onBar = (stage: LeadStage) => (stageBarStages as readonly string[]).includes(stage);

/** Where a step stands against the lead's stage. */
type Place = "passed" | "current" | "later";

/**
 * Every step's shape, a button or not: one 44px target, its segment above its word. On a phone a fifth of the row is
 * narrow, so the steps sit closer and "Contacted" or "requested" still fits its line.
 */
const stepShape =
  "flex h-auto min-h-11 w-full min-w-0 flex-col items-stretch justify-start gap-1.5 rounded-lg px-0.5 pt-2 pb-1.5 text-left text-caption font-normal whitespace-normal sm:px-1";

/** A step's segment, in its stage's colour up to the current one, and its word, with a check once passed. */
function StepMark({ stage, place }: { stage: LeadStage; place: Place }) {
  const t = useTranslations("leads.stages");
  const segment = { passed: stageTones[stage].passed, current: stageTones[stage].dot, later: "bg-hairline" }[place];
  return (
    <>
      <span data-segment={place} aria-hidden="true" className={cn("h-1.5 rounded-full", segment)} />
      <span
        className={cn(
          // A word too long for its fifth breaks rather than running into the next step.
          "flex items-start gap-1 wrap-break-word",
          place === "current" && "font-semibold",
          // Muted until hovered, when the step's own blue (One Action Colour) shows through.
          place === "later" && "text-muted-foreground group-hover/button:text-current",
        )}
      >
        {/* On a phone the lighter tint alone says passed: a check beside the word would push it past its fifth. */}
        {place === "passed" && <CheckIcon aria-hidden="true" className="mt-0.5 hidden size-3 shrink-0 sm:block" />}
        {t(stage)}
      </span>
    </>
  );
}

export function StageBar({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const canEdit = useHolds("leads:edit");
  const write = useWriteAccess("change");
  const hintId = useId();
  const move = useMoveStage();
  const reopen = useReopenLead();
  const currentStage = useRef<HTMLSpanElement>(null);
  // Counts the changes that landed (the lead then shows its new stage), so the focus follows each one.
  const [landings, setLandings] = useState(0);
  useEffect(() => {
    if (landings > 0) currentStage.current?.focus();
  }, [landings]);
  const landed = {
    onSuccess: () => {
      setLandings((count) => count + 1);
    },
  };
  const described = write.hint === null ? undefined : hintId;
  const changeable = canEdit && write.allowed;
  const named = t("lead.stageNamed", { stage: t(`stages.${lead.stage}`) });
  // A tap starts afresh: the last refusal, of either change, goes.
  const tap = (change: () => void) => {
    move.reset();
    reopen.reset();
    change();
  };
  const refusal = <RefusalAlert error={move.error ?? reopen.error} />;

  if (!onBar(lead.stage)) {
    return (
      <section aria-label={named} className="flex flex-col gap-3">
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
                tap(() => {
                  reopen.mutate({ leadId: lead.id }, landed);
                });
              }}
            >
              {reopen.isPending && <Spinner />}
              {t("lead.reopen")}
            </Button>
            <WriteHint id={hintId} hint={write.hint} />
          </div>
        )}
        {refusal}
      </section>
    );
  }

  const current = stageBarStages.findIndex((stage) => stage === lead.stage);
  return (
    <section aria-label={named} className="flex flex-col gap-2">
      {/* The steps' own padding spaces the segments; the list reaches out by as much, so they line up with the page. */}
      <ol className="-mx-0.5 grid grid-cols-5 sm:-mx-1">
        {stageBarStages.map((stage, index) => {
          const place: Place = index < current ? "passed" : index === current ? "current" : "later";
          return (
            <li key={stage} className="flex min-w-0">
              {place === "current" || !canEdit ? (
                <span
                  data-step
                  ref={place === "current" ? currentStage : undefined}
                  tabIndex={place === "current" ? -1 : undefined}
                  aria-current={place === "current" ? "step" : undefined}
                  className={stepShape}
                >
                  <StepMark stage={stage} place={place} />
                </span>
              ) : (
                <Button
                  variant="quiet"
                  className={stepShape}
                  aria-label={t("lead.moveTo", { stage: t(`stages.${stage}`) })}
                  aria-describedby={described}
                  disabled={!write.allowed || move.isPending}
                  onClick={() => {
                    tap(() => {
                      move.mutate({ leadId: lead.id, stage }, landed);
                    });
                  }}
                >
                  <StepMark stage={stage} place={place} />
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {canEdit && <p className="text-caption text-muted-foreground">{t("lead.chooseToMove")}</p>}
      <WriteHint id={hintId} hint={canEdit ? write.hint : null} />
      {refusal}
    </section>
  );
}
