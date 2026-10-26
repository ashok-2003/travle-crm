"use client";

// What is inside a message's bubble (spec 3.2): text as text (links made tappable, never HTML), a photo, video or voice note
// from a presigned link, a document as a download, a place as its coordinates and a link to Maps. `dir="auto"` is set by the
// bubble, so Hindi and other scripts read from the right side.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { FileIcon, ImageIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { useMediaLink } from "./use-inbox";

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

/** What stands where a file will be while it is still being copied, or when it could not be: a plain box, never blank. */
function MediaPlaceholder({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex min-h-24 min-w-40 items-center gap-2 rounded-md bg-background/20 p-3 text-label">
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      {children}
    </p>
  );
}

function Media({ message }: { message: ChatMessage }) {
  const t = useTranslations("inbox.chat");
  const link = useMediaLink(message.id, message.mediaState === "stored");
  const isPhoto = message.kind === "image" || message.kind === "sticker";
  const Icon = isPhoto ? ImageIcon : FileIcon;
  if (message.mediaState === "pending") {
    return <MediaPlaceholder icon={Icon}>{isPhoto ? t("photoLoading") : t("fileLoading")}</MediaPlaceholder>;
  }
  if (message.mediaState === "expired") return <MediaPlaceholder icon={Icon}>{t("photoExpired")}</MediaPlaceholder>;
  if (message.mediaState === "failed") return <MediaPlaceholder icon={Icon}>{t("fileFailed")}</MediaPlaceholder>;
  if (link.data === undefined) {
    return (
      <MediaPlaceholder icon={Icon}>
        {link.isError ? t("fileFailed") : isPhoto ? t("photoLoading") : t("fileLoading")}
      </MediaPlaceholder>
    );
  }
  const { url, contentType, fileName } = link.data;
  if (contentType.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* A customer's photo from storage: its size is unknown, so it is not an optimised Next image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={message.caption ?? t("photo")}
          className="h-48 w-auto max-w-full min-w-24 rounded-md object-cover"
        />
      </a>
    );
  }
  if (contentType.startsWith("video/")) {
    return <video src={url} controls className="max-h-72 max-w-full" aria-label={t("video")} />;
  }
  if (contentType.startsWith("audio/")) return <audio src={url} controls aria-label={t("audio")} />;
  return (
    <a href={url} download={fileName ?? undefined} className="flex items-center gap-2 underline">
      <FileIcon aria-hidden="true" className="size-5 shrink-0" />
      {t("download", { name: fileName ?? t("document") })}
    </a>
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
          <Media message={message} />
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
