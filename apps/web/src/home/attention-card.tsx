"use client";

// "Needs your attention" (spec 5): what the AI needs from this member, the same items as My tasks' "AI needs you": the
// chats it handed over and its Lost / Not a lead suggestions on their leads. View all opens the AI agent page for
// whoever manages the AI, My tasks for anyone else. A phone shows three, so the card stays a glance.
import { Fragment } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { useNeedsMe } from "@/ai/use-needs-me";
import { inboxRoute, leadRoute, routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWideScreen } from "@/lib/use-wide-screen";
import { cn } from "@/lib/utils";
import { HomeCard, rowClasses } from "./home-card";

export function AttentionCard() {
  const t = useTranslations("home.attention");
  const needs = useNeedsMe();
  const wide = useWideScreen();
  const managesAi = useHolds("ai:manage");
  const rows = [
    ...needs.handedOver.map((chat) => ({
      id: chat.conversationId,
      href: inboxRoute(chat.conversationId),
      name: chat.name,
      about: chat.reason === null ? t("handedOver") : t("handedOverWhy", { reason: chat.reason }),
    })),
    ...needs.suggestions.map((suggestion) => ({
      id: suggestion.id,
      href: leadRoute(suggestion.leadId),
      name: suggestion.name,
      about: t("suggestion", { reason: suggestion.reason }),
    })),
  ].slice(0, wide ? 5 : 3);
  return (
    <HomeCard title={t("title")} viewAll={managesAi ? routes.aiAgent : routes.today}>
      {needs.isError && <LoadFailedAlert message={t("loadFailed")} error={needs.error} onRetry={needs.refetch} />}
      {needs.isPending ? (
        <LoadingRows rows={2} />
      ) : rows.length === 0 ? (
        !needs.isError && <p className="text-muted-foreground">{t("nothing")}</p>
      ) : (
        <ItemGroup className={rowClasses.group}>
          {rows.map((row, index) => (
            <Fragment key={row.id}>
              {index > 0 && <ItemSeparator className={rowClasses.separator} />}
              <div role="listitem">
                <Item size="sm" asChild className={rowClasses.item}>
                  <Link href={row.href}>
                    <ItemContent className={rowClasses.content}>
                      <ItemTitle className="script-leading shrink-0">{row.name}</ItemTitle>
                      <ItemDescription title={row.about} className={cn(rowClasses.about, "script-leading")}>
                        {row.about}
                      </ItemDescription>
                    </ItemContent>
                  </Link>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </HomeCard>
  );
}
