"use client";

// The head of the AI screen (the AI sales agent): the agent as a colleague (its name, live, paused or not set up, the model
// that answered last) and its last day in figures: chats it answered, messages it sent, how fast, the chats it flagged for the
// team, the follow-ups it has planned and the lessons it has learned.
import type { AiOverview, AutopilotSettings } from "@travel-crm/contracts/ai";
import {
  BellRingIcon,
  BrainIcon,
  CalendarClockIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  SparklesIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/info-hint";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { aiFirstName } from "./ai-turn";
import { useAiOverview } from "./use-ai";

interface Figure {
  key: "chats" | "messages" | "speed" | "flagged" | "followUps" | "learnings";
  icon: LucideIcon;
  value: string;
}

function figuresOf(overview: AiOverview, seconds: (value: number) => string): Figure[] {
  return [
    { key: "chats", icon: MessagesSquareIcon, value: formatCount(overview.chatsAnswered) },
    { key: "messages", icon: MessageSquareTextIcon, value: formatCount(overview.messagesSent) },
    {
      key: "speed",
      icon: TimerIcon,
      value: overview.medianReplySeconds === null ? "–" : seconds(overview.medianReplySeconds),
    },
    { key: "flagged", icon: BellRingIcon, value: formatCount(overview.flagged) },
    { key: "followUps", icon: CalendarClockIcon, value: formatCount(overview.followUpsPlanned) },
    { key: "learnings", icon: BrainIcon, value: formatCount(overview.learnings) },
  ];
}

/** `ready`: the server has an AI key and models and the agency switched the AI on; `autopilot` answers every chat. */
export function AiHero({ autopilot, ready }: { autopilot: AutopilotSettings; ready: boolean }) {
  const t = useTranslations("ai.hero");
  const overview = useAiOverview();
  const model = overview.data?.model ?? null;
  const name = aiFirstName(autopilot.agentName) ?? t("unnamed");
  const live = ready && autopilot.autopilot;
  const seconds = (value: number) =>
    value < 120 ? t("seconds", { count: value }) : t("minutes", { count: Math.round(value / 60) });
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
        >
          <SparklesIcon className="size-7" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <h2 className="text-section">{name}</h2>
            <StatusBadge tone={!ready ? "neutral" : live ? "good" : "attention"}>
              {!ready ? t("notSetUp") : live ? t("live") : t("chatsYouChoose")}
            </StatusBadge>
          </CardTitle>
          <CardDescription>
            {live ? t("liveLine", { name }) : ready ? t("pausedLine") : t("notSetUpLine")}
          </CardDescription>
        </div>
        {model !== null && <span className="numbers hidden text-caption text-muted-foreground sm:inline">{model}</span>}
      </CardHeader>
      <CardContent>
        {overview.data === undefined ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3" aria-label={t("label")}>
            {figuresOf(overview.data, seconds).map((figure) => (
              <li key={figure.key}>
                <Item variant="muted" className="h-full">
                  <ItemMedia variant="icon">
                    <figure.icon aria-hidden="true" className="text-primary" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="font-mono text-number-lg tabular-nums">{figure.value}</ItemTitle>
                    <ItemDescription className="flex items-center gap-1">
                      {t(`figures.${figure.key}.label`)}
                      <InfoHint term={t(`figures.${figure.key}.label`)}>{t(`figures.${figure.key}.hint`)}</InfoHint>
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
