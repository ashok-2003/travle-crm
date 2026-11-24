"use client";

// What is inside a message's bubble (spec 3.2): text as text (WhatsApp's formatting and links made tappable, never HTML), a photo, video or voice note
// from a presigned link, a document as a download, a place as its coordinates and a link to Maps. `dir="auto"` is set by the
// bubble, so Hindi and other scripts read from the right side.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { InfoHint } from "@/components/info-hint";
import { LocationCard } from "./media/location-card";
import { MessageMedia } from "./media/message-media";
import { WhatsAppText } from "./whatsapp-text";

/** The label of a message deleted for everyone: who deleted it. */
export function deletedLabelKey(message: ChatMessage): "deletedFromPhone" | "deletedByCustomer" {
  return message.origin === "staff_phone" ? "deletedFromPhone" : "deletedByCustomer";
}

// A deleted message keeps its words for the team, struck through, and screen readers hear who deleted it first; a message that
// came from an ad names the ad's headline under its words.
export function MessageBody({ message }: { message: ChatMessage }): ReactNode {
  const t = useTranslations("inbox.chat");
  const deleted = message.revokedAt !== null;
  if (!deleted && message.adHeadline === null) return <MessageContent message={message} />;
  return (
    <div className="flex flex-col gap-1">
      {deleted && <span className="sr-only">{t(deletedLabelKey(message))}. </span>}
      <div className={deleted ? "line-through" : undefined}>
        <MessageContent message={message} />
      </div>
      {message.adHeadline !== null && (
        <span className="text-caption text-muted-foreground">{t("fromAd", { headline: message.adHeadline })}</span>
      )}
    </div>
  );
}

function MessageContent({ message }: { message: ChatMessage }): ReactNode {
  const t = useTranslations("inbox.chat");
  switch (message.kind) {
    case "text":
    case "template":
      if (message.tapped) return message.body === null ? t("tappedNoWords") : t("tapped", { text: message.body });
      if (message.body === null) return null;
      if (message.buttons === null) return <WhatsAppText text={message.body} />;
      return (
        <div className="flex flex-col gap-2">
          <WhatsAppText text={message.body} />
          <span className="text-caption text-muted-foreground">
            {t("cardButtons", { titles: message.buttons.map((button) => button.title).join(" · ") })}
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
              <WhatsAppText text={message.caption} />
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
      if (message.latitude === null || message.longitude === null) return t("unsupported");
      return <LocationCard latitude={message.latitude} longitude={message.longitude} />;
    case "contacts":
      return t("contacts");
    case "reaction":
      return t("reactedWith", { emoji: message.reaction ?? "" });
    case "unsupported":
      return t(
        message.unsupportedReason === "unavailable"
          ? "unavailable"
          : message.unsupportedReason === "album"
            ? "album"
            : "unsupported",
      );
  }
}
