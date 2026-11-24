"use client";

// What is inside a message's bubble (spec 3.2): text as text (WhatsApp's formatting and links made tappable, never HTML), a photo, video or voice note
// from a presigned link, a document as a download, a place as its coordinates and a link to Maps. `dir="auto"` is set by the
// bubble, so Hindi and other scripts read from the right side.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { InfoHint } from "@/components/info-hint";
import { mayBeMissing } from "@/lib/older-api";
import { LocationCard } from "./media/location-card";
import { MessageMedia } from "./media/message-media";
import { WhatsAppText } from "./whatsapp-text";

/** The label of a message deleted for everyone: who deleted it. */
export function deletedLabelKey(message: ChatMessage): "deletedFromPhone" | "deletedByCustomer" {
  return message.direction === "out" ? "deletedFromPhone" : "deletedByCustomer";
}

/** What happened to a message, read as an older api may send it: the fields this release added can be missing (lib/older-api.ts). */
export function whatHappened(message: ChatMessage) {
  return {
    revokedAt: mayBeMissing(message.revokedAt) ?? null,
    editedAt: mayBeMissing(message.editedAt) ?? null,
    adHeadline: mayBeMissing(message.adHeadline) ?? null,
    unsupportedReason: mayBeMissing(message.unsupportedReason) ?? null,
  };
}

// A deleted message keeps its words for the team, struck through, and screen readers hear who deleted it first; a message that
// came from an ad names the ad's headline under its words.
export function MessageBody({ message, after }: { message: ChatMessage; after?: ReactNode }): ReactNode {
  const t = useTranslations("inbox.chat");
  const { revokedAt, adHeadline } = whatHappened(message);
  const deleted = revokedAt !== null;
  if (!deleted && adHeadline === null) return <MessageContent message={message} after={after} />;
  // Inline, never a block box: the bubble's invisible spacer for the corner's time must stay on the text's last line.
  return (
    <>
      {deleted && <span className="sr-only">{t(deletedLabelKey(message))}. </span>}
      <span className={deleted ? "line-through" : undefined}>
        <MessageContent message={message} after={adHeadline === null ? after : undefined} />
      </span>
      {adHeadline !== null && (
        <>
          <br />
          <span className="text-caption text-muted-foreground">{t("fromAd", { headline: adHeadline })}</span>
          {after}
        </>
      )}
    </>
  );
}

// `after` (the bubble's room for the corner's time) goes at the very end of whatever the words are.
function MessageContent({ message, after }: { message: ChatMessage; after?: ReactNode }): ReactNode {
  const ended = (words: ReactNode) => (
    <>
      {words}
      {after}
    </>
  );
  const t = useTranslations("inbox.chat");
  switch (message.kind) {
    case "text":
    case "template":
      if (message.tapped)
        return ended(message.body === null ? t("tappedNoWords") : t("tapped", { text: message.body }));
      if (message.body === null) return ended(null);
      if (message.buttons === null) return <WhatsAppText text={message.body} after={after} />;
      return (
        <div className="flex flex-col gap-2">
          <WhatsAppText text={message.body} />
          <span className="text-caption text-muted-foreground">
            {t("cardButtons", { titles: message.buttons.map((button) => button.title).join(" · ") })}
            {after}
          </span>
        </div>
      );
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker":
      return (
        <div className="flex flex-col gap-2">
          <MessageMedia message={message} />
          {message.caption !== null && (
            <div dir="auto">
              <WhatsAppText text={message.caption} after={after} />
            </div>
          )}
          {message.aiText !== null && (
            <p dir="auto" className="flex items-start gap-1 text-caption text-muted-foreground">
              <span className="min-w-0 break-words">
                {t(message.aiText.kind === "transcript" ? "aiText.heard" : "aiText.seen", {
                  text: message.aiText.text,
                })}
              </span>
              <InfoHint term={t(message.aiText.kind === "transcript" ? "aiText.heardTerm" : "aiText.seenTerm")}>
                {t(message.aiText.kind === "transcript" ? "aiText.heardHint" : "aiText.seenHint")}
              </InfoHint>
            </p>
          )}
        </div>
      );
    case "location":
      if (message.latitude === null || message.longitude === null) return ended(t("unsupported"));
      return (
        <>
          <LocationCard latitude={message.latitude} longitude={message.longitude} />
          {after}
        </>
      );
    case "contacts":
      return ended(t("contacts"));
    case "reaction":
      return ended(t("reactedWith", { emoji: message.reaction ?? "" }));
    case "unsupported":
      return ended(
        t(
          whatHappened(message).unsupportedReason === "unavailable"
            ? "unavailable"
            : whatHappened(message).unsupportedReason === "album"
              ? "album"
              : "unsupported",
        ),
      );
  }
}
