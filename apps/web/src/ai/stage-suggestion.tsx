"use client";

// The AI's suggestion to mark a lead Lost or Not a lead: an alert above the lead's cards with the reason, and, for whoever
// may edit leads, "Yes, mark it …" and "No". The AI never moves the lead itself; the choice is the person's.
import type { StageSuggestion } from "@travel-crm/contracts/ai";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
        <Button
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

/** The alert on a lead's page; nothing when the AI has no open suggestion for the lead. */
export function StageSuggestionAlert({ leadId }: { leadId: string }) {
  const t = useTranslations("ai.stageSuggestion");
  const suggestion = useLeadStageSuggestion(leadId).data?.suggestion ?? null;
  if (suggestion === null) return null;
  return (
    <Alert>
      <SparklesIcon aria-hidden="true" />
      <AlertTitle>{t("title", { stage: t(`stages.${suggestion.kind}`) })}</AlertTitle>
      <AlertDescription>
        <p>{suggestion.reason}</p>
        <SuggestionButtons suggestion={suggestion} />
      </AlertDescription>
    </Alert>
  );
}
