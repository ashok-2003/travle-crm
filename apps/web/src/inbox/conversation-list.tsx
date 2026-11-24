"use client";

// The inbox's list of chats (spec 3.1; sales inbox spec, sections 3 and design v2), dense like the chat apps sales teams
// live in, two lines: the person's tinted picture, their name, how long the customer has waited ("waiting 25m") or else
// how long ago the last message came ("18m", "5h", "25 Oct"), and the unread count (or a dot while they wait); under it
// our ticks and the last message's first words, the lead's stage as its coloured pill, its owner's initials when it is
// not the member, and the chat's WhatsApp number (once the agency has two). A chat the AI handed to a person wears an
// amber hand. The open chat is marked as the current link. A chat (its page and its data) is asked for ahead as the
// pointer rests on its row or the row gets the focus (inbox revamp spec, part 1 item 3), so it opens at once.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import { AlarmClockIcon, HandIcon, PinIcon, SmartphoneIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Item, ItemContent, ItemGroup, ItemMedia } from "@/components/ui/item";
import { OwnerInitials } from "@/leads/owner-initials";
import { stageTones } from "@/leads/stage-badge";
import { formatDay, formatPhoneNumber } from "@/lib/format";
import { elapsed } from "@/lib/relative-time";
import { inboxRoute } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { ChatAvatar } from "./chat-avatar";
import { Ticks } from "./ticks";
import { usePrefetchChat } from "./use-inbox";
import { useNumbers } from "./use-numbers";
import { useOwners } from "./use-owner-names";
import { waitedFor, waitTone } from "./wait-timer";
import { plainWhatsAppText } from "./whatsapp-format";

/** How long the pointer rests on a row before its chat is asked for: passing over rows on the way elsewhere asks nothing. */
export const PREFETCH_REST_MS = 150;

/** The handlers that ask for a row's chat ahead: when the pointer has rested on it, or at once when it gets the focus. */
function usePrefetchOnRest(conversationId: string) {
  const prefetchChat = usePrefetchChat();
  const router = useRouter();
  const prefetch = (id: string) => {
    router.prefetch(inboxRoute(id));
    prefetchChat(id);
  };
  const resting = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(resting.current);
    resting.current = undefined;
  };
  return {
    onPointerEnter: () => {
      stop();
      resting.current = window.setTimeout(() => {
        prefetch(conversationId);
      }, PREFETCH_REST_MS);
    },
    onPointerLeave: stop,
    onFocus: () => {
      stop();
      prefetch(conversationId);
    },
  };
}

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

/** "waiting 25m", in the tone of the chat header's timer (wait-timer.tsx): amber from half the reply target, red from the target. */
const waitInk = {
  bad: "text-status-bad-ink",
  attention: "text-status-attention-ink",
  neutral: "text-muted-foreground",
};
function WaitingFor({ since }: { since: string }) {
  const t = useTranslations("inbox");
  const minutes = Math.floor((useNow().getTime() - new Date(since).getTime()) / 60_000);
  return (
    <span className={cn("text-caption font-semibold", waitInk[waitTone(minutes)])}>
      {t("waitingShort", { time: waitedFor(minutes) })}
    </span>
  );
}

function Row({
  chat,
  current,
  numberLabel,
}: {
  chat: ConversationListItem;
  current: boolean;
  /** The chat's number's label, shown once the agency has two numbers; null otherwise. */
  numberLabel: string | null;
}) {
  const t = useTranslations("inbox");
  const tStages = useTranslations("leads.stages");
  const when = useShortWhen();
  const { nameOf } = useOwners();
  const me = useMe();
  const prefetch = usePrefetchOnRest(chat.id);
  const fresh = chat.unread > 0 || chat.needsReply;
  // The open chat's row is darker (bg-hairline), where the muted grey is too faint to read.
  const quiet = current ? "text-foreground" : "text-muted-foreground";
  return (
    // The row never grows past the list's width: a long message is cut, so the time stays in view.
    <div role="listitem" className="min-w-0">
      <Item
        asChild
        size="sm"
        className={cn(
          "w-full min-w-0 flex-nowrap rounded-none px-3 py-2.5 hover:bg-surface",
          current && "bg-hairline hover:bg-hairline",
        )}
      >
        <Link
          href={inboxRoute(chat.id)}
          aria-current={current ? "page" : undefined}
          data-chat-row="true"
          data-chat-id={chat.id}
          {...prefetch}
        >
          <ItemMedia>
            <ChatAvatar name={chat.name} seed={chat.id} />
          </ItemMedia>
          <ItemContent className="min-w-0 flex-1 gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {chat.handedOver && (
                  <HandIcon
                    aria-label={t("handedOver")}
                    role="img"
                    className="size-3.5 shrink-0 text-status-attention-ink"
                  />
                )}
                <span
                  className={cn(
                    "truncate script-leading",
                    fresh ? "font-semibold" : "font-medium",
                    chat.name === null && "numbers",
                  )}
                >
                  {chat.name ?? formatPhoneNumber(chat.phone)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {chat.snoozedUntil !== null && (
                  <AlarmClockIcon aria-label={t("snoozed")} role="img" className="size-3.5 text-muted-foreground" />
                )}
                {chat.pinned && (
                  <PinIcon aria-label={t("pinned")} role="img" className="size-3.5 text-muted-foreground" />
                )}
                {chat.waitingSince !== null ? (
                  <WaitingFor since={chat.waitingSince} />
                ) : (
                  <span className={cn("text-caption", fresh ? "font-semibold text-primary" : quiet)}>
                    {when(chat.lastMessageAt)}
                  </span>
                )}
                {chat.unread > 0 ? (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-people-tint px-1.5 text-caption font-semibold text-people-tint-ink"
                    aria-label={t("unreadCount", { count: chat.unread })}
                  >
                    {chat.unread}
                  </span>
                ) : (
                  chat.needsReply && (
                    <span className="size-2.5 rounded-full bg-people-tint-ink" role="img" aria-label={t("waiting")} />
                  )
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={cn("flex min-w-0 items-center gap-1 text-label", fresh ? "text-foreground" : quiet)}>
                {chat.lastDirection === "out" && chat.lastStatus !== null && <Ticks status={chat.lastStatus} />}
                <span className="truncate script-leading" dir="auto">
                  {plainWhatsAppText(chat.preview)}
                </span>
              </span>
              <span className={cn("flex shrink-0 items-center gap-1.5 text-caption", quiet)}>
                {chat.lead === null ? (
                  chat.isNewNumber && <span>{t("newNumber")}</span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-caption font-medium",
                      stageTones[chat.lead.stage as LeadStage].badge,
                    )}
                  >
                    {tStages(chat.lead.stage as never)}
                  </span>
                )}
                {chat.lead?.ownerUserId != null && chat.lead.ownerUserId !== me.user.id && (
                  <OwnerInitials name={nameOf(chat.lead.ownerUserId)} />
                )}
                {numberLabel !== null && (
                  <span className="flex min-w-0 items-center gap-1">
                    <SmartphoneIcon aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{numberLabel}</span>
                  </span>
                )}
              </span>
            </div>
          </ItemContent>
        </Link>
      </Item>
    </div>
  );
}

export function ConversationList({ items, currentId }: { items: ConversationListItem[]; currentId: string | null }) {
  const t = useTranslations("inbox");
  const { labelOf } = useNumbers();
  return (
    <ItemGroup aria-label={t("list")} className="gap-0">
      {items.map((chat) => (
        <Row key={chat.id} chat={chat} current={chat.id === currentId} numberLabel={labelOf(chat.connectionId)} />
      ))}
    </ItemGroup>
  );
}
