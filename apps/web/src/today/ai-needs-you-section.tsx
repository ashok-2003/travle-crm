"use client";

// "AI needs you" on My tasks: the chats the AI handed over and its Lost / Not a lead suggestions on the member's own
// leads, then the payments waiting for their word as one line; the section scrolls inside itself like the others.
import type { HandedOverChat, StageSuggestion } from "@travel-crm/contracts/ai";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { DenseRow } from "@/components/dense-row";
import { ScrollingSection } from "@/components/scrolling-section";
import { ForwardLink, TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { SuggestionButtons } from "@/ai/stage-suggestion";
import type { useNeedsMe } from "@/ai/use-needs-me";
import { inboxRoute, leadRoute, routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { PaymentsToCheckLine } from "./payments-to-check-line";

function HandedOverRow({ chat }: { chat: HandedOverChat }) {
  const t = useTranslations("today.aiNeedsYou");
  return (
    <DenseRow
      line={<ItemTitle className="script-leading lg:min-h-0">{chat.name}</ItemTitle>}
      detail={chat.reason === null ? t("handedOver") : t("handedOverWhy", { reason: chat.reason })}
      actions={
        <Button variant="outline" asChild>
          <Link href={inboxRoute(chat.conversationId)} aria-label={t("openChatPerson", { name: chat.name })}>
            {t("openChat")}
          </Link>
        </Button>
      }
    />
  );
}

function SuggestionRow({ suggestion }: { suggestion: StageSuggestion }) {
  const t = useTranslations("today.aiNeedsYou");
  return (
    <DenseRow
      line={
        <span className="shrink-0 lg:[&>a]:min-h-0">
          <TextLink href={leadRoute(suggestion.leadId)}>{suggestion.name}</TextLink>
        </span>
      }
      detail={t("suggestion", { reason: suggestion.reason })}
      actions={<SuggestionButtons suggestion={suggestion} />}
    />
  );
}

export function AiNeedsYouSection({
  needs,
  paymentsToCheck,
  defaultOpen,
}: {
  needs: ReturnType<typeof useNeedsMe>;
  paymentsToCheck: number;
  /** On a phone: whether the section starts open. */
  defaultOpen: boolean;
}) {
  const t = useTranslations("today");
  const managesAi = useHolds("ai:manage");
  const rows = [
    ...needs.handedOver.map((chat) => ({ id: chat.conversationId, row: <HandedOverRow chat={chat} /> })),
    ...needs.suggestions.map((suggestion) => ({
      id: suggestion.id,
      row: <SuggestionRow suggestion={suggestion} />,
    })),
  ];
  return (
    // Counts the AI's rows only; the payments line says its own number.
    <ScrollingSection
      title={t("sections.aiNeedsYou")}
      count={needs.count > 0 ? needs.count : undefined}
      defaultOpen={defaultOpen}
      action={managesAi ? <ForwardLink href={routes.aiAgent} label={t("aiAgentLink")} /> : undefined}
      footer={paymentsToCheck > 0 ? <PaymentsToCheckLine count={paymentsToCheck} /> : undefined}
    >
      {needs.isError && (
        <LoadFailedAlert message={t("aiNeedsYou.loadFailed")} error={needs.error} onRetry={needs.refetch} />
      )}
      {rows.length > 0 && (
        <ItemGroup className="gap-0">
          {rows.map(({ id, row }, index) => (
            <Fragment key={id}>
              {index > 0 && <ItemSeparator className="my-0" />}
              {row}
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </ScrollingSection>
  );
}
