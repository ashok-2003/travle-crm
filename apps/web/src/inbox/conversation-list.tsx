"use client";

// The inbox's list of chats (spec 3.1; sales inbox spec, sections 3 and design v2), dense like the chat apps sales teams
// live in: the person's tinted picture, their name and how long ago the last message came ("18m", "5h", "25 Oct"); under
// them our ticks and the last message's first words, with the member's unread count (or a dot while the customer waits)
// and a pin; then the sale: the lead's stage as its coloured pill, its owner, how long the customer has waited, and the
// agency's tags. The open chat is marked as the current link.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import { AlarmClockIcon, PinIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Item, ItemContent, ItemGroup, ItemMedia } from "@/components/ui/item";
import { stageTones } from "@/leads/stage-badge";
import { formatDay, formatPhoneNumber } from "@/lib/format";
import { elapsed } from "@/lib/relative-time";
import { inboxRoute } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { ChatAvatar } from "./chat-avatar";
import { Ticks } from "./ticks";
import { useOwners } from "./use-owner-names";
import { WaitTimer } from "./wait-timer";

/** "18m", "5h" within a day; after that the day ("25 Oct"). */
function useShortWhen() {
  const { timeZone } = useMe().organization;
  const now = useNow();
  return (instant: string | null) => {
    if (instant === null) return "";
    const at = new Date(instant);
    const ago = elapsed(at, now);
    if (ago.unit === "minute") return `${String(ago.count)}m`;
    if (ago.unit === "hour") return `${String(ago.count)}h`;
    return formatDay(at, { timeZone, now });
  };
}

function Row({ chat, current }: { chat: ConversationListItem; current: boolean }) {
  const t = useTranslations("inbox");
  const tStages = useTranslations("leads.stages");
  const when = useShortWhen();
  const { nameOf } = useOwners();
  const owner = chat.lead === null ? null : nameOf(chat.lead.ownerUserId);
  const fresh = chat.unread > 0 || chat.needsReply;
  return (
    // The row never grows past the list's width: a long message is cut, so the time stays in view.
    <div role="listitem" className="min-w-0">
      <Item
        asChild
        size="sm"
        className={cn(
          "w-full min-w-0 flex-nowrap rounded-none px-3 py-2.5 hover:bg-chat-bar",
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
            <ChatAvatar name={chat.name} seed={chat.id} />
          </ItemMedia>
          <ItemContent className="min-w-0 flex-1 gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "truncate script-leading",
                  fresh ? "font-semibold" : "font-medium",
                  chat.name === null && "numbers",
                )}
              >
                {chat.name ?? formatPhoneNumber(chat.phone)}
              </span>
              <span
                className={cn("shrink-0 text-caption", fresh ? "font-semibold text-primary" : "text-muted-foreground")}
              >
                {when(chat.lastMessageAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1 text-label",
                  fresh ? "text-foreground" : "text-muted-foreground",
                )}
              >
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
            <div className="flex min-w-0 items-center gap-2 pt-0.5 text-caption text-muted-foreground">
              {chat.lead === null ? (
                chat.isNewNumber && <span>{t("newNumber")}</span>
              ) : (
                <>
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-caption font-medium",
                      stageTones[chat.lead.stage as LeadStage].badge,
                    )}
                  >
                    {tStages(chat.lead.stage as never)}
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    <UserRoundIcon aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{owner ?? t("unassigned")}</span>
                  </span>
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
  );
}

export function ConversationList({ items, currentId }: { items: ConversationListItem[]; currentId: string | null }) {
  const t = useTranslations("inbox");
  return (
    <ItemGroup aria-label={t("list")} className="gap-0">
      {items.map((chat) => (
        <Row key={chat.id} chat={chat} current={chat.id === currentId} />
      ))}
    </ItemGroup>
  );
}
