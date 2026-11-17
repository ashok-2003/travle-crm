"use client";

// What is inside a message's bubble (spec 3.2): text as text (links made tappable, never HTML), a photo, video or voice note
// from a presigned link, a document as a download, a place as its coordinates and a link to Maps. `dir="auto"` is set by the
// bubble, so Hindi and other scripts read from the right side.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { InfoHint } from "@/components/info-hint";
import { LocationCard } from "./media/location-card";
import { MessageMedia } from "./media/message-media";

const LINK = /(https?:\/\/[^\s<>"']+)/g;

/** Text with its web addresses as links that open in a tab of their own, without passing on where they came from. */
function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(LINK).map((part, index) =>
        // The split keeps each address at an odd place.
        index % 2 === 1 ? (
          <a
            key={`${String(index)}-${part}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {part}
          </a>
        ) : (
          <Fragment key={`${String(index)}-${part}`}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function MessageBody({ message }: { message: ChatMessage }): ReactNode {
  const t = useTranslations("inbox.chat");
  switch (message.kind) {
    case "text":
    case "template":
      if (message.tapped) return message.body === null ? t("tappedNoWords") : t("tapped", { text: message.body });
      if (message.body === null) return null;
      if (message.buttons === null) return <Linked text={message.body} />;
      return (
        <div className="flex flex-col gap-2">
          <Linked text={message.body} />
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
            <p dir="auto" className="whitespace-pre-wrap break-words">
              <Linked text={message.caption} />
            </p>
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
      return t("unsupported");
  }
}
