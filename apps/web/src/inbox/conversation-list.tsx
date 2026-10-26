"use client";

// The inbox's list of chats (spec 3.1; sales inbox spec, section 3), dense like WhatsApp's: the round picture, the name
// and the time; under them our ticks and the last message's first words, and on the right a violet dot when the customer
// waits for a reply (the member's unread count once they have opened it before), and a pin on a pinned chat. A third
// line carries the sale: the lead's stage and its owner's name ("New number" when nobody knows the person yet), then the
// agency's tags. The open chat is marked as the current link.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import { AlarmClockIcon, PinIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator } from "@/components/ui/item";
import { StageDot } from "@/leads/stage-badge";
import { formatDay, formatPhoneNumber, formatTime } from "@/lib/format";
import { inboxRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { ChatAvatar } from "./chat-avatar";
import { Ticks } from "./ticks";
import { useOwners } from "./use-owner-names";
import { WaitTimer } from "./wait-timer";

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
            {index > 0 && <ItemSeparator className="my-0 ml-[4.5rem]" />}
            <div role="listitem">
              <Item
                asChild
                size="sm"
                className={cn(
                  "min-w-0 rounded-none px-3 py-3 hover:bg-surface",
                  current && "bg-hairline hover:bg-hairline",
                )}
              >
                <Link
                  href={inboxRoute(chat.id)}
                  aria-current={current ? "page" : undefined}
                  data-chat-row="true"
                  data-chat-id={chat.id}
                >
                  <ItemMedia>
                    <ChatAvatar name={chat.name} />
                  </ItemMedia>
                  <ItemContent className="min-w-0 flex-1 gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate font-medium script-leading", chat.name === null && "numbers")}>
                        {chat.name ?? formatPhoneNumber(chat.phone)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-caption",
                          chat.needsReply || chat.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground",
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
                      <span className="flex shrink-0 items-center gap-1.5">
                        {chat.pinned && (
                          <PinIcon aria-label={t("pinned")} role="img" className="size-3.5 text-muted-foreground" />
                        )}
                        {chat.unread > 0 ? (
                          <span
                            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground"
                            aria-label={t("unreadCount", { count: chat.unread })}
                          >
                            {chat.unread}
                          </span>
                        ) : (
                          chat.needsReply && (
                            <span className="size-2.5 rounded-full bg-primary" role="img" aria-label={t("waiting")} />
                          )
                        )}
                      </span>
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
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {chat.snoozedUntil !== null && (
                          <AlarmClockIcon aria-label={t("snoozed")} role="img" className="size-3.5" />
                        )}
                        {chat.waitingSince !== null && <WaitTimer since={chat.waitingSince} />}
                      </span>
                    </div>
                    {chat.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {chat.tags.map((tag) => (
                          <Badge key={tag.id} variant="secondary" className="h-5 px-1.5 text-caption font-normal">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}
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
