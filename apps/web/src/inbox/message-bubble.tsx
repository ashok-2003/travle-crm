"use client";

// One message of a chat (spec 3.2): the customer's on one side in white, ours on the other in WhatsApp's green, with its time
// and, for ours, who sent it (or that it was an automatic reply) and its state in ticks; a failed one says why and offers Try
// again. Nothing is drawn with a border or shadow.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useHolds, useMe } from "@/session/me-context";
import { useChatJump } from "./chat-jump";
import { MessageActions, NotSent } from "./message-actions";
import { MessageBody } from "./message-body";
import { QuoteBlock } from "./quote-block";
import { Ticks } from "./ticks";
import { useReplying } from "./use-replying";

/**
 * One bubble. `first` is the first of a run from the same side: it gets the tail and the space above it, as in WhatsApp,
 * and later ones in the run sit close under it. The time, the sender's first name and our ticks sit in the bubble's corner.
 */
export function MessageBubble({
  message,
  senderName,
  quotedSender,
  first,
}: {
  message: ChatMessage;
  senderName: string | null;
  /** Who wrote the message this one quotes, as the quote names them. */
  quotedSender: string;
  first: boolean;
}) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const ours = message.direction === "out";
  const failed = ours && message.status === "failed";
  const firstName = senderName?.split(/\s+/)[0];
  const sticker = message.kind === "sticker";
  const media = ["image", "video", "sticker"].includes(message.kind);
  const { highlightId } = useChatJump();
  const { replyTo } = useReplying();
  const mayReply = useHolds("inbox:reply");
  const swipe = useRef<{ x: number; y: number } | null>(null);
  return (
    <li
      data-message-id={message.id}
      className={cn(
        "group flex items-start gap-1 px-3 transition-colors duration-500 md:px-[6%]",
        ours ? "flex-row-reverse" : "flex-row",
        first ? "mt-2" : "mt-0.5",
        highlightId === message.id && "bg-chat-date-chip",
      )}
      // A swipe to the right on a touch screen answers this message, as in WhatsApp.
      onTouchStart={(event) => {
        const touch = event.touches[0];
        swipe.current = touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = swipe.current;
        const touch = event.changedTouches[0];
        swipe.current = null;
        if (!mayReply || start === null || touch === undefined) return;
        if (touch.clientX - start.x > 64 && Math.abs(touch.clientY - start.y) < 32) replyTo(message);
      }}
    >
      <div
        className={cn(
          "relative flex max-w-[min(85%,38rem)] flex-col gap-1 rounded-lg text-body",
          media ? "p-1" : "px-2.5 pt-1.5 pb-1",
          sticker
            ? "bg-transparent"
            : ours
              ? "bg-chat-bubble-out text-foreground"
              : "bg-chat-bubble-in text-foreground",
          first && !sticker && (ours ? "rounded-tr-none" : "rounded-tl-none"),
          // The tail: a small triangle at the top corner, cut with a clip path (no border is drawn).
          first &&
            !sticker &&
            (ours
              ? "before:absolute before:top-0 before:-right-2 before:size-2 before:bg-chat-bubble-out before:[clip-path:polygon(0_0,100%_0,0_100%)]"
              : "before:absolute before:top-0 before:-left-2 before:size-2 before:bg-chat-bubble-in before:[clip-path:polygon(0_0,100%_0,100%_100%)]"),
        )}
      >
        {message.quoted !== null && <QuoteBlock quoted={message.quoted} senderName={quotedSender} />}
        <div dir="auto" className={cn("break-words whitespace-pre-wrap script-leading", media && "px-1.5")}>
          <MessageBody message={message} />
          {/* Room for the corner's time, so the last line never runs under it. */}
          {!media && (
            <span
              aria-hidden="true"
              className={cn(
                "inline-block",
                ours ? (message.origin === "automation" ? "w-52" : firstName === undefined ? "w-28" : "w-40") : "w-20",
              )}
            />
          )}
        </div>
        {message.reaction !== null && message.kind !== "reaction" && (
          <span
            className="absolute -bottom-3 left-2 rounded-full bg-chat-bubble-in px-1.5 text-caption"
            aria-label={t("reactedWith", { emoji: message.reaction })}
          >
            {message.reaction}
          </span>
        )}
        {failed && <NotSent message={message} />}
        {message.quoteDropped && <p className="text-caption text-muted-foreground">{t("reply.sentWithoutQuote")}</p>}
        <p
          className={cn(
            "flex items-center justify-end gap-1 self-end text-caption",
            !media && "-mt-5",
            "text-muted-foreground",
            media && "px-1.5 pb-0.5",
          )}
        >
          {ours && firstName !== undefined && <span>{firstName} ·</span>}
          {ours && firstName === undefined && message.origin === "staff_crm" && message.sentBy !== null && (
            <span>{t("formerMember")} ·</span>
          )}
          {message.origin === "staff_phone" && <span>{t("phoneApp")} ·</span>}
          {message.origin === "automation" && <span>{t("automatic")} ·</span>}
          {message.starred && <StarIcon aria-label={t("starred")} role="img" className="size-3 fill-current" />}
          <span>{formatTime(new Date(message.occurredAt), { timeZone })}</span>
          {ours && !failed && <Ticks status={message.status} className="size-3.5" />}
          {/* One place for both sides: the end of the time line, shown on hover with a mouse and always on a touch screen. */}
          <MessageActions
            message={message}
            className="relative opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
          />
        </p>
      </div>
    </li>
  );
}
