"use client";

// The inbox's list of chats (spec 3.1; sales inbox spec, section 3), dense like WhatsApp's: the round picture, the name
// and the time; under them our ticks and the last message's first words, and on the right a violet dot when the customer
// waits for a reply. A third line carries the sale: the lead's stage and its owner's name ("New number" when nobody
// knows the person yet). The open chat is marked as the current link.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator } from "@/components/ui/item";
import { StageDot } from "@/leads/stage-badge";
import { formatDay, formatPhoneNumber, formatTime } from "@/lib/format";
import { inboxRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { ChatAvatar } from "./chat-avatar";
import { Ticks } from "./ticks";
import { useOwners } from "./use-owner-names";

export function ConversationList({ items, currentId }: { items: ConversationListItem[]; currentId: string | null }) {
  const t = useTranslations("inbox");
  const tStages = useTranslations("leads.stages");
  const { timeZone } = useMe().organization;
  const { nameOf } = useOwners();
  const when = (instant: string | null) => {
    if (instant === null) return "";
    const date = new Date(instant);
    const now = new Date();
    const sameDay = formatDay(date, { timeZone, now }) === formatDay(now, { timeZone, now });
    return sameDay ? formatTime(date, { timeZone }) : formatDay(date, { timeZone, now });
  };
  return (
    <ItemGroup aria-label={t("list")} className="gap-0">
      {items.map((chat, index) => {
        const owner = chat.lead === null ? null : nameOf(chat.lead.ownerUserId);
        const current = chat.id === currentId;
        return (
          <Fragment key={chat.id}>
            {index > 0 && <ItemSeparator className="ml-[4.5rem]" />}
            <div role="listitem">
              <Item asChild size="sm" className={cn("rounded-none px-3 py-2.5 hover:bg-muted", current && "bg-muted")}>
                <Link href={inboxRoute(chat.id)} aria-current={current ? "page" : undefined}>
                  <ItemMedia>
                    <ChatAvatar name={chat.name} />
                  </ItemMedia>
                  <ItemContent className="min-w-0 gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium script-leading">
                        {chat.name ?? formatPhoneNumber(chat.phone)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-caption",
                          chat.needsReply ? "font-semibold text-people" : "text-muted-foreground",
                        )}
                      >
                        {when(chat.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1 text-label text-muted-foreground">
                        {chat.lastDirection === "out" && chat.lastStatus !== null && <Ticks status={chat.lastStatus} />}
                        <span className="truncate script-leading" dir="auto">
                          {chat.preview}
                        </span>
                      </span>
                      {chat.needsReply && (
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-people"
                          role="img"
                          aria-label={t("waiting")}
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
                      {chat.lead === null ? (
                        chat.isNewNumber && <span>{t("newNumber")}</span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1">
                            <StageDot stage={chat.lead.stage as LeadStage} />
                            {tStages(chat.lead.stage as never)}
                          </span>
                          {owner !== null && <span className="truncate">· {owner}</span>}
                          {chat.lead.ownerUserId === null && <span>· {t("unassigned")}</span>}
                        </>
                      )}
                    </div>
                  </ItemContent>
                </Link>
              </Item>
            </div>
          </Fragment>
        );
      })}
    </ItemGroup>
  );
}
