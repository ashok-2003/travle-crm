"use client";

// "Needs you · N" on the AI agent's Overview: three tiles at a glance (the chats the AI handed over, its Lost or Not a
// lead suggestions to confirm, the payments to check), each with its count, amber while something waits and quiet when
// nothing does, and its button: the first two jump to their lists just below (only while something waits), the third
// opens Payments to check (always: its page is there either way). The counts are the api's totals, not the 20 rows a
// list shows. A member sees, and N counts, only what the api lets them act on. The lists sit side by side from 1280px.
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { cardTints } from "@/components/card-tints";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemHeader, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { HandedOverList, SuggestionList } from "./needs-you-lists";
import { useHandedOver, usePaymentsToCheckCount, useStageSuggestions } from "./use-agent";

/** Where the tiles' buttons jump to: the lists just below them. */
const listIds = { handedOver: "needs-you-handed-over", suggestions: "needs-you-suggestions" } as const;

/**
 * `count` is undefined while it loads and null when it failed (the alert above says so). The button shows while something
 * waits, or always when `always` (a page of its own, not a list below).
 */
function Tile({
  label,
  count,
  action,
  always = false,
}: {
  label: string;
  count: number | null | undefined;
  action: ReactNode;
  always?: boolean;
}) {
  const waiting = typeof count === "number" && count > 0;
  return (
    // The words take the tile's first line, so a narrow tile never squeezes them beside the button.
    <Item variant="outline" className={cn(waiting && cardTints.attention)}>
      <ItemHeader>
        <ItemTitle>{label}</ItemTitle>
      </ItemHeader>
      <ItemContent>
        {count === undefined ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          count !== null && (
            <span className={cn("numbers text-number-lg font-medium", waiting && "text-status-attention-ink")}>
              {formatCount(count)}
            </span>
          )
        )}
      </ItemContent>
      {(waiting || always) && <ItemActions>{action}</ItemActions>}
    </Item>
  );
}

export function NeedsYou() {
  const t = useTranslations("aiAgent.needsYou");
  const headingId = useId();
  const handed = useHandedOver();
  const payments = usePaymentsToCheckCount();
  const suggested = useStageSuggestions();
  const chats = handed.query.data?.chats;
  const suggestions = suggested.query.data?.suggestions;
  const waiting = payments.query.data?.count;
  // Only what the member may act on is shown and counted, each in full.
  const counts = [
    ...(handed.may ? [handed.query.data?.total] : []),
    ...(suggested.may ? [suggested.query.data?.total] : []),
    ...(payments.may ? [waiting] : []),
  ];
  const settled = counts.every((count) => count !== undefined);
  const total = counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
  const failed =
    (handed.may && handed.query.isError) ||
    (payments.may && payments.query.isError) ||
    (suggested.may && suggested.query.isError);
  const hasChats = chats !== undefined && chats.length > 0;
  const hasSuggestions = suggestions !== undefined && suggestions.length > 0;
  const jump = (id: string, words: string) => (
    <Button variant="outline" asChild>
      <a href={`#${id}`}>{words}</a>
    </Button>
  );
  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{settled && total > 0 ? t("titleCount", { count: total }) : t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {failed && (
          <LoadFailedAlert
            message={t("loadFailed")}
            error={handed.query.error ?? payments.query.error ?? suggested.query.error}
            onRetry={() =>
              void Promise.all([handed.query.refetch(), payments.query.refetch(), suggested.query.refetch()])
            }
          />
        )}
        {settled && !failed && total === 0 && <p>{t("nothing")}</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {handed.may && (
            <Tile
              label={t("tiles.handedOver")}
              count={handed.query.isError ? null : handed.query.data?.total}
              action={jump(listIds.handedOver, t("show.handedOver"))}
            />
          )}
          {suggested.may && (
            <Tile
              label={t("tiles.suggestions")}
              count={suggested.query.isError ? null : suggested.query.data?.total}
              action={jump(listIds.suggestions, t("show.suggestions"))}
            />
          )}
          {payments.may && (
            <Tile
              label={t("tiles.payments")}
              count={payments.query.isError ? null : waiting}
              always
              action={
                <Button variant="outline" asChild>
                  <Link href={routes.payments}>{t("show.payments")}</Link>
                </Button>
              }
            />
          )}
        </div>
        {(hasChats || hasSuggestions) && (
          <div className={cn("grid gap-6", hasChats && hasSuggestions && "xl:grid-cols-2")}>
            {hasChats && <HandedOverList id={listIds.handedOver} chats={chats} />}
            {hasSuggestions && <SuggestionList id={listIds.suggestions} suggestions={suggestions} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
