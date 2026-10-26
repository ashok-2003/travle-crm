"use client";

// What is inside a message's bubble (spec 3.2): text as text (links made tappable, never HTML), a photo, video or voice note
// from a presigned link, a document as a download, a place as its coordinates and a link to Maps. `dir="auto"` is set by the
// bubble, so Hindi and other scripts read from the right side.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
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
      return message.body === null ? null : <Linked text={message.body} />;
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
        </div>
      );
    case "location": {
      if (message.latitude === null || message.longitude === null) return t("unsupported");
      const point = `${String(message.latitude)}, ${String(message.longitude)}`;
      return (
        <div className="flex flex-col gap-1">
          <p>{t("location", { latitude: String(message.latitude), longitude: String(message.longitude) })}</p>
          <a
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`}
          >
            {t("openInMaps")}
          </a>
        </div>
      );
    }
    case "contacts":
      return t("contacts");
    case "reaction":
      return t("reactedWith", { emoji: message.reaction ?? "" });
    case "unsupported":
      return t("unsupported");
  }
}
