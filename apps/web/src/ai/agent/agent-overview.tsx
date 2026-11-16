"use client";

// The AI agent's Overview tab: its state, what needs a person (handed-over chats, the AI's Lost suggestions, payments to check) and its last 24 hours.
import { brand } from "@travel-crm/brand";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { FigureCell, type Figure } from "@/dashboard/kpi-strip";
import { formatCount, formatDayTime, formatPhoneNumber } from "@/lib/format";
import { inboxRoute, leadRoute, routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useAiOverview } from "../use-ai";
import { SuggestionButtons } from "../stage-suggestion";
import { useAgentSetup, useHandedOver, usePaymentsToCheckCount, useStageSuggestions } from "./use-agent";

export const setupHref = `${routes.aiAgent}?tab=setup`;

function State() {
  const t = useTranslations("aiAgent.state");
  const setup = useAgentSetup();
  if (setup.isError && setup.data === undefined) {
    return <LoadFailedAlert message={t("loadFailed")} error={setup.error} onRetry={() => void setup.refetch()} />;
  }
  if (setup.data === undefined) return null;
  const { on, ready, pausedBySupport } = setup.data;
  // One state, in this order: support's pause wins over everything.
  const [tone, words] = pausedBySupport
    ? (["attention", t("paused", { product: brand.productName })] as const)
    : on
      ? ready
        ? (["good", t("on")] as const)
        : (["attention", t("onNotReady")] as const)
      : ready
        ? (["neutral", t("off")] as const)
        : (["neutral", t("notSetUp")] as const);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={tone}>{words}</StatusBadge>
      </div>
      {!pausedBySupport && !ready && <TextLink href={setupHref}>{t(on ? "finishSetup" : "openSetup")}</TextLink>}
    </div>
  );
}

function NeedsYou() {
  const t = useTranslations("aiAgent.needsYou");
  const tStage = useTranslations("ai.stageSuggestion");
  const timeZone = useMe().organization.timeZone;
  const handed = useHandedOver();
  const payments = usePaymentsToCheckCount();
  const suggested = useStageSuggestions();
  const chats = handed.query.data ?? [];
  const suggestions = suggested.query.data?.suggestions ?? [];
  const waiting = payments.query.data?.count ?? 0;
  const settled =
    (!handed.may || handed.query.isSuccess) &&
    (!payments.may || payments.query.isSuccess) &&
    (!suggested.may || suggested.query.isSuccess);
  const failed =
    (handed.may && handed.query.isError) ||
    (payments.may && payments.query.isError) ||
    (suggested.may && suggested.query.isError);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {failed && (
          <LoadFailedAlert
            message={t("loadFailed")}
            error={handed.query.error ?? payments.query.error ?? suggested.query.error}
            onRetry={() =>
              void Promise.all([handed.query.refetch(), payments.query.refetch(), suggested.query.refetch()])
            }
          />
        )}
        {chats.length > 0 && (
          <ItemGroup aria-label={t("handedOver")}>
            {chats.map((chat, index) => (
              <div key={chat.conversationId}>
                {index > 0 && <ItemSeparator />}
                <Item>
                  <ItemContent>
                    <ItemTitle>
                      <TextLink href={inboxRoute(chat.conversationId)}>{formatPhoneNumber(chat.name)}</TextLink>
                    </ItemTitle>
                    <ItemDescription>{chat.reason ?? t("reasonNone")}</ItemDescription>
                    <ItemDescription>
                      {t("since", { when: formatDayTime(new Date(chat.since), { timeZone }) })}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
        {suggestions.length > 0 && (
          <ItemGroup aria-label={t("suggestions")}>
            {suggestions.map((suggestion, index) => (
              <div key={suggestion.id}>
                {index > 0 && <ItemSeparator />}
                <Item>
                  <ItemContent>
                    <ItemTitle>
                      <TextLink href={leadRoute(suggestion.leadId)}>{suggestion.name}</TextLink>
                    </ItemTitle>
                    <ItemDescription>
                      {t("suggested", { stage: tStage(`stages.${suggestion.kind}`), reason: suggestion.reason })}
                    </ItemDescription>
                    <ItemDescription>
                      {t("since", { when: formatDayTime(new Date(suggestion.createdAt), { timeZone }) })}
                    </ItemDescription>
                    <SuggestionButtons suggestion={suggestion} />
                  </ItemContent>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
        {waiting > 0 && (
          <TextLink href={routes.payments}>
            {t("payments")}: {t("paymentsCount", { count: waiting })}
          </TextLink>
        )}
        {settled && !failed && chats.length === 0 && suggestions.length === 0 && waiting === 0 && <p>{t("nothing")}</p>}
      </CardContent>
    </Card>
  );
}

function LastDay() {
  const t = useTranslations("aiAgent.last24");
  const overview = useAiOverview();
  const figures: (Figure & { key: "chats" | "messages" | "bookings" | "flagged" })[] = overview.data
    ? [
        { key: "chats", value: formatCount(overview.data.chatsAnswered), hint: t("chatsHint") },
        { key: "messages", value: formatCount(overview.data.messagesSent), hint: t("messagesHint") },
        { key: "bookings", value: formatCount(overview.data.bookingsRequested), hint: t("bookingsHint") },
        { key: "flagged", value: formatCount(overview.data.flagged), hint: t("flaggedHint") },
      ]
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {overview.data ? (
          <div className="grid grid-cols-2 md:grid-cols-4">
            {figures.map((figure, index) => (
              <Fragment key={figure.key}>
                <FigureCell
                  figure={figure}
                  label={t(figure.key)}
                  index={index}
                  count={figures.length}
                  wideNext={index === 1}
                />
                {/* On a phone the figures sit two to a row: a line between the rows, as the vertical one is between cells. */}
                {index === 1 && <Separator className="col-span-2 md:hidden" />}
              </Fragment>
            ))}
          </div>
        ) : overview.isError ? (
          <LoadFailedAlert message={t("loadFailed")} error={overview.error} onRetry={() => void overview.refetch()} />
        ) : (
          <LoadingRows shape="twoLines" label={t("title")} />
        )}
      </CardContent>
    </Card>
  );
}

export function AgentOverview() {
  return (
    <div className="flex flex-col gap-6">
      <State />
      <NeedsYou />
      <LastDay />
    </div>
  );
}
