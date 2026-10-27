"use client";

// What the AI makes of a lead (the AI sales agent): how likely it books in the next two weeks, as a number and hot,
// warm or cold; a warning when it looks fake (spam, a test, a wrong number); why; what the customer said they want; and
// what to do next. Rescored after each customer message.
import type { LeadInsight } from "@travel-crm/contracts/ai";
import { SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { InfoHint } from "@/components/info-hint";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";

export const labelTone: Record<LeadInsight["label"], StatusTone> = { hot: "good", warm: "attention", cold: "neutral" };

/** The score as a chip, for a header or a list: "72% · Hot", or Fake. */
export function ScoreBadge({ insight }: { insight: Pick<LeadInsight, "score" | "label" | "fake"> }) {
  const t = useTranslations("ai.insight");
  return insight.fake ? (
    <StatusBadge tone="bad">{t("fake")}</StatusBadge>
  ) : (
    <StatusBadge tone={labelTone[insight.label]}>
      <span className="numbers">{t("percent", { score: insight.score })}</span> · {t(`labels.${insight.label}`)}
    </StatusBadge>
  );
}

export function InsightCard({ insight }: { insight: LeadInsight | null }) {
  const t = useTranslations("ai.insight");
  const { timeZone } = useMe().organization;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon aria-hidden="true" className="size-4 text-primary" />
          <h3>{t("title")}</h3>
          <InfoHint term={t("title")}>{t("info")}</InfoHint>
        </CardTitle>
        {insight !== null && (
          <>
            <CardDescription>
              {t("updated", { when: formatDayTime(new Date(insight.updatedAt), { timeZone }) })}
            </CardDescription>
            <CardAction>
              <ScoreBadge insight={insight} />
            </CardAction>
          </>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {insight === null ? (
          <p className="text-muted-foreground">{t("none")}</p>
        ) : (
          <>
            {insight.fake && (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>{t("fakeTitle")}</AlertTitle>
                <AlertDescription>{insight.fakeReason ?? t("fakeHint")}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-label text-muted-foreground">{t("chance")}</span>
                <span className="numbers text-section font-semibold">{t("percent", { score: insight.score })}</span>
              </p>
              <Progress value={insight.score} aria-label={t("chance")} />
            </div>
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
            <Details
              rows={(["destination", "when", "travellers", "budget"] as const).map((fact) => ({
                label: t(`facts.${fact}`),
                value: insight.facts[fact] ?? t("unknown"),
              }))}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
