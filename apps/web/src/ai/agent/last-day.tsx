"use client";

// The top of the AI agent's Overview: its last 24 hours as a strip of four figures on the AI's violet card (Home's AI
// tint, DESIGN.md "The AI Agent Page's Tints"), each with its ⓘ. A figure is a way in only where a list holds exactly
// what it counts: Chats answered opens the Inbox's Answered by the AI (for a member who sees the Inbox). Messages sent and
// Flagged have no such list, nor Bookings requested: no page lists the AI's bookings across leads (a booking it takes
// reaches Bookings only once a person confirms it).
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { cardTints } from "@/components/card-tints";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FigureCell, type Figure } from "@/dashboard/kpi-strip";
import { formatCount } from "@/lib/format";
import { inboxAiAnsweredRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useAiOverview } from "../use-ai";

type FigureKey = "chats" | "messages" | "bookings" | "flagged";

export function LastDay() {
  const t = useTranslations("aiAgent.last24");
  const headingId = useId();
  const overview = useAiOverview();
  const seesInbox = useHolds("inbox:view");
  const data = overview.data;
  const figure = (key: FigureKey, value: number): Figure & { key: FigureKey } => ({
    key,
    value: formatCount(value),
    hint: t(`${key}Hint`),
  });
  const figures =
    data === undefined
      ? []
      : [
          {
            ...figure("chats", data.chatsAnswered),
            ...(seesInbox && {
              link: { href: inboxAiAnsweredRoute, name: t("chatsLink", { count: formatCount(data.chatsAnswered) }) },
            }),
          },
          figure("messages", data.messagesSent),
          figure("bookings", data.bookingsRequested),
          figure("flagged", data.flagged),
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
            {figures.map((one, index) => (
              <Fragment key={one.key}>
                <FigureCell
                  figure={one}
                  label={t(one.key)}
                  index={index}
                  count={figures.length}
                  wideNext={index === 1}
                  valueClassName="text-(--brand-people-tint-ink)"
                />
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
