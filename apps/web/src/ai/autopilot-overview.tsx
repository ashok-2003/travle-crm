"use client";

// Settings, AI: the autopilot's last day at a glance: what it answered, how fast, what it flagged for the team.
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { useAiOverview } from "./use-ai";

export function AutopilotOverview() {
  const t = useTranslations("ai.overview");
  const overview = useAiOverview().data;
  if (overview === undefined) return null;
  const figures = [
    { key: "chatsAnswered", value: String(overview.chatsAnswered) },
    { key: "messagesSent", value: String(overview.messagesSent) },
    {
      key: "medianReply",
      value: overview.medianReplySeconds === null ? "–" : t("seconds", { count: overview.medianReplySeconds }),
    },
    { key: "flagged", value: String(overview.flagged) },
    { key: "followUps", value: String(overview.followUpsPlanned) },
    { key: "lessons", value: String(overview.learnings) },
  ] as const;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">{t("title")}</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.key} className="flex flex-col">
              <dt className="text-label text-muted-foreground">{t(figure.key)}</dt>
              <dd className="numbers text-section font-semibold">{figure.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
