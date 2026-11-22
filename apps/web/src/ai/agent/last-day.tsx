"use client";

// The top of the AI agent's Overview: its last 24 hours as a strip of four figures on the AI's violet card (Home's AI
// tint, DESIGN.md "The AI Agent Page's Tints"), each with its ⓘ. A figure is a way in only where a list holds exactly
// what it counts: Chats answered opens the Inbox's Answered by the AI (for a member who sees the Inbox), with a hover
// and an arrow. Messages sent and Flagged have no such list, nor Bookings requested: no page lists the AI's bookings
// across leads (a booking it takes reaches Bookings only once a person confirms it).
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { cardTints } from "@/components/card-tints";
import { InfoHint } from "@/components/info-hint";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCount } from "@/lib/format";
import { inboxAiAnsweredRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { useAiOverview } from "../use-ai";

type FigureKey = "chats" | "messages" | "bookings" | "flagged";

interface DayFigure {
  key: FigureKey;
  value: number;
  /** The list behind the number, where there is one. */
  href?: string;
}

/** One figure; a figure with a list is a link over the whole cell, under its ⓘ (later in the page, so above it). */
function FigureTile({ figure, last, rowEnd }: { figure: DayFigure; last: boolean; rowEnd: boolean }) {
  const t = useTranslations("aiAgent.last24");
  const label = t(figure.key);
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("relative flex", figure.href !== undefined && "hover:bg-people-tint motion-safe:transition-colors")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <span className="flex items-center gap-1 text-label text-muted-foreground">
          {figure.href === undefined ? (
            label
          ) : (
            <Link href={figure.href} className="underline-offset-4 after:absolute after:inset-0 hover:underline">
              {label}
            </Link>
          )}
          <InfoHint term={label}>{t(`${figure.key}Hint`)}</InfoHint>
        </span>
        <span className="flex items-center gap-2 font-mono text-number-lg font-medium text-(--brand-people-tint-ink) tabular-nums">
          {formatCount(figure.value)}
          {figure.href !== undefined && <ArrowRightIcon aria-hidden="true" className="size-5" />}
        </span>
      </div>
      {!last && <Separator orientation="vertical" className={cn(rowEnd && "hidden md:block")} />}
    </div>
  );
}

export function LastDay() {
  const t = useTranslations("aiAgent.last24");
  const headingId = useId();
  const overview = useAiOverview();
  const seesInbox = useHolds("inbox:view");
  const data = overview.data;
  const figures: DayFigure[] =
    data === undefined
      ? []
      : [
          { key: "chats", value: data.chatsAnswered, ...(seesInbox && { href: inboxAiAnsweredRoute }) },
          { key: "messages", value: data.messagesSent },
          { key: "bookings", value: data.bookingsRequested },
          { key: "flagged", value: data.flagged },
        ];
  return (
    <Card role="region" aria-labelledby={headingId} className={cardTints.ai}>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data !== undefined ? (
          <div className="grid grid-cols-2 md:grid-cols-4">
            {figures.map((figure, index) => (
              <Fragment key={figure.key}>
                <FigureTile figure={figure} last={index === figures.length - 1} rowEnd={index === 1} />
                {/* On a phone the figures sit two to a row: a line between the rows, as the vertical one is between cells. */}
                {index === 1 && <Separator className="col-span-2 md:hidden" />}
              </Fragment>
            ))}
          </div>
        ) : overview.isError ? (
          <div className="px-4">
            <LoadFailedAlert message={t("loadFailed")} error={overview.error} onRetry={() => void overview.refetch()} />
          </div>
        ) : (
          <div className="px-4">
            <LoadingRows shape="twoLines" label={t("title")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
