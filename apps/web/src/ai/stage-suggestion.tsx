"use client";

// The AI's suggestion to mark a lead Lost or Not a lead: first on the lead's page, in the AI's violet card (the lead page's
// revamp, 2026-11-21), with the reason, and, for whoever may edit leads, "Yes, mark it …" (soft red: it ends the lead)
// and "No". The AI never moves the lead itself; the choice is the person's.
import type { StageSuggestion } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { cardTints } from "@/components/card-tints";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiChip } from "./ai-chip";
import { useHolds } from "@/session/me-context";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import { useDecideStageSuggestion, useLeadStageSuggestion } from "./use-ai";

/** Yes and No for one suggestion; nothing for a member who may not edit leads. Used on the lead's page and in the AI page's list. */
export function SuggestionButtons({ suggestion }: { suggestion: StageSuggestion }) {
  const t = useTranslations("ai.stageSuggestion");
  const canEdit = useHolds("leads:edit");
  const access = useWriteAccess("change");
  const decide = useDecideStageSuggestion();
  if (!canEdit) return null;
  const stage = t(`stages.${suggestion.kind}`);
  const hintId = `stage-suggestion-hint-${suggestion.id}`;
  const send = (accept: boolean) => {
    decide.mutate({ suggestionId: suggestion.id, accept });
  };
  return (
    <div className="flex flex-col gap-2">
      <RefusalAlert error={decide.error} />
      <div className="flex flex-wrap items-center gap-2">
        {/* Yes ends the lead (Lost, Not a lead): destructive, as every ending action is (DESIGN.md Buttons). */}
        <Button
          variant="destructive"
          disabled={!access.allowed || decide.isPending}
          aria-describedby={access.hint === null ? undefined : hintId}
          onClick={() => {
            send(true);
          }}
        >
          {t("yes", { stage })}
        </Button>
        <Button
          variant="outline"
          disabled={!access.allowed || decide.isPending}
          aria-describedby={access.hint === null ? undefined : hintId}
          onClick={() => {
            send(false);
          }}
        >
          {t("no")}
        </Button>
      </div>
      <WriteHint id={hintId} hint={access.hint} />
    </div>
  );
}

/** The suggestion's card on a lead's page; nothing when the AI has no open suggestion for the lead. */
export function StageSuggestionCard({ leadId }: { leadId: string }) {
  const t = useTranslations("ai.stageSuggestion");
  const titleId = useId();
  const suggestion = useLeadStageSuggestion(leadId).data?.suggestion ?? null;
  if (suggestion === null) return null;
  return (
    <Card size="sm" role="region" aria-labelledby={titleId} className={cardTints.ai}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <AiChip />
          <h2 id={titleId}>{t("title", { stage: t(`stages.${suggestion.kind}`) })}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>{suggestion.reason}</p>
        <SuggestionButtons suggestion={suggestion} />
      </CardContent>
    </Card>
  );
}
