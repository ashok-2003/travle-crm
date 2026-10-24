"use client";

// One message of a chat (spec 3.2): the customer's on one side in the muted token, ours on the other in the primary one,
// with its time and, for ours, its state in words. Text is shown as text (links made tappable, never HTML) and
// `dir="auto"` so Hindi and other scripts read from the right side. A photo, video or voice note comes from a presigned
// link; a document is a download; a place is its coordinates and a link to Maps. Nothing is drawn with a border or shadow.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { FileIcon, ImageIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
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

function Body({ message }: { message: ChatMessage }): ReactNode {
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

export function MessageBubble({ message }: { message: ChatMessage }) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const ours = message.direction === "out";
  return (
    <li className={cn("flex", ours ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1 rounded-lg px-3 py-2",
          ours ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {message.quoted !== null && (
          <p className="text-caption opacity-80" dir="auto">
            {t("quoted")}: {message.quoted.body ?? t(message.quoted.kind === "image" ? "photo" : "document")}
          </p>
        )}
        <div dir="auto" className="break-words whitespace-pre-wrap script-leading">
          <Body message={message} />
        </div>
        {message.reaction !== null && message.kind !== "reaction" && (
          <p aria-label={t("reactedWith", { emoji: message.reaction })}>{message.reaction}</p>
        )}
        <p className="text-caption opacity-80">
          {message.origin === "staff_phone" && `${t("phoneApp")} · `}
          {formatTime(new Date(message.occurredAt), { timeZone })}
          {ours && ` · ${t(`status.${message.status}`)}`}
        </p>
      </div>
    </li>
  );
}
