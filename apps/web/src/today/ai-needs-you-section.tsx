"use client";

// "AI needs you" on My tasks: the chats the AI handed over and its Lost / Not a lead suggestions on the member's own
// leads, then the payments waiting for their word as one line. Five rows at most; View all opens the AI agent page, for
// whoever manages the AI.
import type { HandedOverChat, StageSuggestion } from "@travel-crm/contracts/ai";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ForwardLink, TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { SuggestionButtons } from "@/ai/stage-suggestion";
import type { useNeedsMe } from "@/ai/use-needs-me";
import { formatCount } from "@/lib/format";
import { inboxRoute, leadRoute, routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { PaymentsToCheckLine } from "./payments-to-check-line";
import { ROWS_SHOWN } from "./today-section";

function HandedOverRow({ chat }: { chat: HandedOverChat }) {
  const t = useTranslations("today.aiNeedsYou");
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle className="min-h-11 script-leading">{chat.name}</ItemTitle>
        <ItemDescription className="break-words script-leading">
          {chat.reason === null ? t("handedOver") : t("handedOverWhy", { reason: chat.reason })}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="basis-full">
        <Button variant="outline" asChild>
          <Link href={inboxRoute(chat.conversationId)} aria-label={t("openChatPerson", { name: chat.name })}>
            {t("openChat")}
          </Link>
        </Button>
      </ItemActions>
    </Item>
  );
}

function SuggestionRow({ suggestion }: { suggestion: StageSuggestion }) {
  const t = useTranslations("today.aiNeedsYou");
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0">
        <TextLink href={leadRoute(suggestion.leadId)}>{suggestion.name}</TextLink>
        <ItemDescription className="break-words script-leading">
          {t("suggestion", { reason: suggestion.reason })}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="basis-full">
        <SuggestionButtons suggestion={suggestion} />
      </ItemActions>
    </Item>
  );
}

export function AiNeedsYouSection({
  needs,
  paymentsToCheck,
}: {
  needs: ReturnType<typeof useNeedsMe>;
  paymentsToCheck: number;
}) {
  const t = useTranslations("today");
  const headingId = useId();
  const managesAi = useHolds("ai:manage");
  const rows = [
    ...needs.handedOver.map((chat) => ({ id: chat.conversationId, row: <HandedOverRow chat={chat} /> })),
    ...needs.suggestions.map((suggestion) => ({
      id: suggestion.id,
      row: <SuggestionRow suggestion={suggestion} />,
    })),
  ];
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-section font-semibold">
          {t("sections.aiNeedsYou")}
        </h2>
        {/* Counts the AI's rows only; the payments line says its own number. */}
        {needs.count > 0 && (
          <span className="numbers text-label text-muted-foreground">{formatCount(needs.count)}</span>
        )}
      </div>
      {needs.isError && (
        <LoadFailedAlert message={t("aiNeedsYou.loadFailed")} error={needs.error} onRetry={needs.refetch} />
      )}
      {rows.length > 0 && (
        <ItemGroup>
          {rows.slice(0, ROWS_SHOWN).map(({ id, row }, index) => (
            <Fragment key={id}>
              {index > 0 && <ItemSeparator />}
              {row}
            </Fragment>
          ))}
        </ItemGroup>
      )}
      {rows.length > ROWS_SHOWN && managesAi && <ForwardLink href={routes.aiAgent} label={t("viewAll")} />}
      {paymentsToCheck > 0 && <PaymentsToCheckLine count={paymentsToCheck} />}
    </section>
  );
}
