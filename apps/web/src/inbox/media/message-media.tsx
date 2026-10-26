"use client";

// The file inside a bubble (audit 1-3, 15, 17): a photo or video as a thumbnail that opens the viewer, a sticker bare and
// larger, a voice note with the browser's player, a document as a card. While the file is being copied, or when it could not
// be, a plain box says so in words that name the kind of file, never blank.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { FileIcon, ImageIcon, MicIcon, PlayIcon, VideoIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useMediaLink } from "../use-inbox";
import { DocumentCard } from "./document-card";
import { useOpenMedia } from "./media-viewer";

type MediaKind = "image" | "video" | "audio" | "document" | "sticker";
const iconOfKind: Record<MediaKind, LucideIcon> = {
  image: ImageIcon,
  sticker: ImageIcon,
  video: VideoIcon,
  audio: MicIcon,
  document: FileIcon,
};

/** What stands where a file will be while it is still being copied, or when it could not be: a plain box, never blank. */
function MediaPlaceholder({ kind, children }: { kind: MediaKind; children: ReactNode }) {
  const Icon = iconOfKind[kind];
  return (
    <p className="flex min-h-24 min-w-40 items-center gap-2 rounded-md bg-background/20 p-3 text-label">
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      {children}
    </p>
  );
}

export function MessageMedia({ message }: { message: ChatMessage }) {
  const t = useTranslations("inbox.chat");
  const open = useOpenMedia();
  const kind = message.kind as MediaKind;
  const link = useMediaLink(message.id, message.mediaState === "stored");
  if (message.mediaState === "pending")
    return <MediaPlaceholder kind={kind}>{t(`mediaPending.${kind}`)}</MediaPlaceholder>;
  if (message.mediaState === "expired")
    return <MediaPlaceholder kind={kind}>{t(`mediaExpired.${kind}`)}</MediaPlaceholder>;
  if (message.mediaState === "failed")
    return <MediaPlaceholder kind={kind}>{t(`mediaFailed.${kind}`)}</MediaPlaceholder>;
  if (link.data === undefined) {
    return (
      <MediaPlaceholder kind={kind}>
        {link.isError ? t(`mediaFailed.${kind}`) : t(`mediaPending.${kind}`)}
      </MediaPlaceholder>
    );
  }
  const { url, contentType } = link.data;
  if (kind === "document") return <DocumentCard messageId={message.id} link={link.data} />;
  if (kind === "audio" || contentType.startsWith("audio/")) {
    return <audio src={url} controls className="max-w-full" aria-label={t("audio")} />;
  }
  if (kind === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={t("sticker")} className="size-36 object-contain" />;
  }
  const isVideo = contentType.startsWith("video/");
  const thumbnail = isVideo ? (
    <span className="relative block">
      <video
        src={url}
        preload="metadata"
        muted
        playsInline
        className="max-h-72 max-w-full rounded-md object-contain"
        aria-label={t("video")}
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <PlayIcon aria-hidden="true" className="size-12 rounded-full bg-scrim p-3 text-background" />
      </span>
    </span>
  ) : (
    // A customer's photo from storage: its size is unknown, so it is not an optimised Next image. The height is
    // bounded and the shape kept, so a tall photo and a wide one both sit in the chat as they are.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={message.caption ?? t("photo")}
      className="h-auto max-h-72 w-auto max-w-full min-w-24 rounded-md object-contain"
    />
  );
  if (open === null) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {thumbnail}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="block text-left"
      aria-label={isVideo ? t("playVideo") : t("openPhoto")}
      onClick={() => {
        open(message.id);
      }}
    >
      {thumbnail}
    </button>
  );
}
