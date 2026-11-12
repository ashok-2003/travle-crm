"use client";

// The AI agent's Overview tab: its state, what needs a person (handed-over chats, payments to check) and its last 24 hours.
import { brand } from "@travel-crm/brand";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { inboxRoute, routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useAiOverview } from "../use-ai";
import { useAgentSetup, useHandedOver, usePaymentsToCheckCount } from "./use-agent";

export const setupHref = `${routes.aiAgent}?tab=setup`;

function State() {
  const t = useTranslations("aiAgent.state");
  const setup = useAgentSetup();
  if (setup.data === undefined) return null;
  const { on, ready, pausedBySupport } = setup.data;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {pausedBySupport && <StatusBadge tone="attention">{t("paused", { product: brand.productName })}</StatusBadge>}
        {!pausedBySupport && on && <StatusBadge tone="good">{t("on")}</StatusBadge>}
        {!on && ready && <StatusBadge tone="neutral">{t("off")}</StatusBadge>}
        {!on && !ready && <StatusBadge tone="neutral">{t("notSetUp")}</StatusBadge>}
      </div>
      {!on && !ready && <TextLink href={setupHref}>{t("openSetup")}</TextLink>}
    </div>
  );
}

function NeedsYou() {
  const t = useTranslations("aiAgent.needsYou");
  const timeZone = useMe().organization.timeZone;
  const handed = useHandedOver();
  const payments = usePaymentsToCheckCount();
  const chats = handed.query.data ?? [];
  const waiting = payments.query.data?.count ?? 0;
  const settled = (!handed.may || handed.query.isSuccess) && (!payments.may || payments.query.isSuccess);
  const failed = (handed.may && handed.query.isError) || (payments.may && payments.query.isError);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {failed && (
          <LoadFailedAlert
            message={t("loadFailed")}
            error={handed.query.error ?? payments.query.error}
            onRetry={() => void Promise.all([handed.query.refetch(), payments.query.refetch()])}
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
                      <TextLink href={inboxRoute(chat.conversationId)}>{chat.name}</TextLink>
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
        {waiting > 0 && (
          <TextLink href={routes.payments}>
            {t("payments")}: {t("paymentsCount", { count: waiting })}
          </TextLink>
        )}
        {settled && !failed && chats.length === 0 && waiting === 0 && <p>{t("nothing")}</p>}
      </CardContent>
    </Card>
  );
}

function LastDay() {
  const t = useTranslations("aiAgent.last24");
  const overview = useAiOverview();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {overview.data ? (
          <dl className="grid grid-cols-3 gap-4">
            {(
              [
                ["chats", overview.data.chatsAnswered],
                ["messages", overview.data.messagesSent],
                ["handedOver", overview.data.flagged],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1">
                <dt className="text-caption text-muted-foreground">{t(key)}</dt>
                <dd className="text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
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
