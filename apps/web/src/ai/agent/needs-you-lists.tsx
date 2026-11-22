"use client";

// The lists under "Needs you"'s tiles: the chats the AI handed over, each opening the chat in the Inbox, and its Lost or
// Not a lead suggestions, each with its lead, its reason and Yes and No.
import type { HandedOverChat, StageSuggestion } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { TextLink } from "@/components/text-link";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatDayTime, formatPhoneNumber } from "@/lib/format";
import { inboxRoute, leadRoute } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { SuggestionButtons } from "../stage-suggestion";

/** A list with its heading, which a tile's button jumps to. */
function ListSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-2">
      <h3 id={`${id}-title`} className="font-semibold">
        {title}
      </h3>
      <ItemGroup aria-label={title}>{children}</ItemGroup>
    </section>
  );
}

export function HandedOverList({ id, chats }: { id: string; chats: HandedOverChat[] }) {
  const t = useTranslations("aiAgent.needsYou");
  const { timeZone } = useMe().organization;
  return (
    <ListSection id={id} title={t("handedOver")}>
      {chats.map((chat, index) => (
        <div key={chat.conversationId} role="listitem">
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
    </ListSection>
  );
}

export function SuggestionList({ id, suggestions }: { id: string; suggestions: StageSuggestion[] }) {
  const t = useTranslations("aiAgent.needsYou");
  const tStage = useTranslations("ai.stageSuggestion");
  const { timeZone } = useMe().organization;
  return (
    <ListSection id={id} title={t("suggestions")}>
      {suggestions.map((suggestion, index) => (
        <div key={suggestion.id} role="listitem">
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
    </ListSection>
  );
}
