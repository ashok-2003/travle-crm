"use client";

// The AI's guess of how a lead will go (Settings, AI turns it on for the agency): how likely it books in the next two weeks, as
// hot, warm or cold and a number; a warning when it looks fake (spam, a test, a wrong number); a line on how the lead stands;
// what the AI noted from the chat (three lines, then More); what to do next; and why, folded until opened (the lead page's
// revamp, 2026-11-21). The trip card shows what the customer wants. Always shown as a guess, in the AI's violet tint, and
// it never moves the lead's stage. Nothing shows until the AI has scored the lead from its chat. LeadTemperature is the
// guess alone ("Warm 65%"), for the lead's header.
import type { LeadInsight } from "@travel-crm/contracts/ai";
import { ChevronDownIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AiChip } from "./ai-chip";
import { cardTints } from "@/components/card-tints";
import { ClampedLines } from "@/components/clamped-lines";
import { InfoHint } from "@/components/info-hint";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useLeadInsight } from "./use-ai";

/** The guess as a chip in the AI's tint, "Warm 65%": it is the AI's word, not a stage or a status. */
function GuessChip({ insight, named = false }: { insight: LeadInsight; named?: boolean }) {
  const t = useTranslations("ai.insight");
  return (
    <span
      data-temperature
      className="inline-flex min-h-6 items-center gap-1 rounded-badge bg-people-tint px-2 text-caption font-medium text-people-tint-ink"
    >
      {named && (
        <>
          <SparklesIcon aria-hidden="true" className="size-3" />
          <span className="sr-only">{t("title")}: </span>
        </>
      )}
      {insight.fake
        ? t("fake")
        : t.rich("temperature", {
            label: t(`labels.${insight.label}`),
            score: insight.score,
            number: (chunks) => <span className="numbers">{chunks}</span>,
          })}
    </span>
  );
}

function Why({ reasons }: { reasons: string[] }) {
  const t = useTranslations("ai.insight");
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-1">
      <h3>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="-mx-3 px-3">
            {t("why")}
            <ChevronDownIcon aria-hidden="true" className={open ? "rotate-180" : undefined} />
          </Button>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function InsightCard({ insight }: { insight: LeadInsight }) {
  const t = useTranslations("ai.insight");
  const { timeZone } = useMe().organization;
  const titleId = useId();
  return (
    <Card size="sm" role="region" aria-labelledby={titleId} className={cardTints.ai}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <AiChip />
          <h2 id={titleId}>{t("title")}</h2>
          <InfoHint term={t("title")}>{t("info")}</InfoHint>
          <GuessChip insight={insight} />
        </CardTitle>
        <CardDescription>
          {t("updated", { when: formatDayTime(new Date(insight.updatedAt), { timeZone }) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {insight.fake && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>{t("fakeTitle")}</AlertTitle>
            <AlertDescription>{insight.fakeReason ?? t("fakeHint")}</AlertDescription>
          </Alert>
        )}
        {insight.summary !== "" && <p>{insight.summary}</p>}
        {insight.chatSummary !== null && (
          <div className="flex flex-col gap-1">
            <h3 className="text-label font-medium text-muted-foreground">{t("noted")}</h3>
            <ClampedLines text={insight.chatSummary} />
          </div>
        )}
        {insight.nextStep !== "" && (
          <div className="flex flex-col gap-1">
            <h3 className="text-label font-medium text-muted-foreground">{t("nextStep")}</h3>
            <p>{insight.nextStep}</p>
          </div>
        )}
        {insight.reasons.length > 0 && <Why reasons={insight.reasons} />}
      </CardContent>
    </Card>
  );
}

/** A lead page's guess: shown once the AI has scored the lead; nothing until then, or where the AI isn't for this member. */
export function LeadInsight({ leadId }: { leadId: string }) {
  const insight = useLeadInsight(leadId).data?.insight ?? null;
  return insight === null ? null : <InsightCard insight={insight} />;
}

/** The guess alone, for the lead's header beside its stage: nothing until the AI has scored the lead. */
export function LeadTemperature({ leadId }: { leadId: string }) {
  const insight = useLeadInsight(leadId).data?.insight ?? null;
  return insight === null ? null : <GuessChip insight={insight} named />;
}
