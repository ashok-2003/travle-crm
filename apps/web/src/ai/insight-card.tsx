"use client";

// The AI's guess of how a lead will go (Settings, AI turns it on for the agency): how likely it books in the next two weeks, as
// a number and hot, warm or cold; a warning when it looks fake (spam, a test, a wrong number); a line on how the lead stands;
// what to do next; why; and what the AI noted from the chat. The trip card shows what the customer wants. Always shown as a guess, in the AI's violet tint, and it never moves the lead's stage. Nothing
// shows until the AI has scored the lead from its chat.
import type { LeadInsight } from "@travel-crm/contracts/ai";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { AiChip } from "./ai-chip";
import { InfoHint } from "@/components/info-hint";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useLeadInsight } from "./use-ai";

/** The label as a chip in the AI's tint: it is the AI's word, not a stage or a status. */
function GuessChip({ insight }: { insight: LeadInsight }) {
  const t = useTranslations("ai.insight");
  return (
    <span className="inline-flex min-h-6 items-center rounded-badge bg-people-tint px-2 text-caption font-medium text-people-tint-ink">
      {insight.fake ? (
        t("fake")
      ) : (
        <>
          <span className="numbers">{t("percent", { score: insight.score })}</span>&nbsp;·&nbsp;
          {t(`labels.${insight.label}`)}
        </>
      )}
    </span>
  );
}

export function InsightCard({ insight }: { insight: LeadInsight }) {
  const t = useTranslations("ai.insight");
  const { timeZone } = useMe().organization;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <AiChip />
          <h3>{t("title")}</h3>
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
            <h4 className="text-label font-medium text-muted-foreground">{t("noted")}</h4>
            <p className="whitespace-pre-line">{insight.chatSummary}</p>
          </div>
        )}
        {insight.nextStep !== "" && (
          <div className="flex flex-col gap-1">
            <h4 className="text-label font-medium text-muted-foreground">{t("nextStep")}</h4>
            <p>{insight.nextStep}</p>
          </div>
        )}
        {insight.reasons.length > 0 && (
          <div className="flex flex-col gap-1">
            <h4 className="text-label font-medium text-muted-foreground">{t("why")}</h4>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {insight.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A lead page's guess: shown once the AI has scored the lead; nothing until then, or where the AI isn't for this member. */
export function LeadInsight({ leadId }: { leadId: string }) {
  const insight = useLeadInsight(leadId).data?.insight ?? null;
  return insight === null ? null : <InsightCard insight={insight} />;
}
