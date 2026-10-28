"use client";

// The file inside a bubble (audit 1-3, 15, 17): a photo or video as a thumbnail that opens the viewer, a sticker bare and
// larger, a voice note with the browser's player, a document as a card. While the file is being copied, or when it could not
// be, a plain box says so in words that name the kind of file, never blank.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { FileIcon, ImageIcon, MicIcon, VideoIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useMediaLink } from "../use-inbox";
import { DocumentCard } from "./document-card";
import { useOpenMedia } from "./media-viewer";
import { StickerImage, StickerTile } from "./sticker";
import { VideoThumb } from "./video-thumb";
import { VoiceNotePlayer } from "./voice-note-player";

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
    if (kind === "sticker") return <StickerTile />;
    return (
      <MediaPlaceholder kind={kind}>
        {link.isError ? t(`mediaFailed.${kind}`) : t(`mediaPending.${kind}`)}
      </MediaPlaceholder>
    );
  }
  const { url, contentType } = link.data;
  if (kind === "document") return <DocumentCard messageId={message.id} link={link.data} />;
  if (kind === "audio" || contentType.startsWith("audio/")) {
    return <VoiceNotePlayer url={url} />;
  }
  if (kind === "sticker") return <StickerImage url={url} alt={t("sticker")} />;
  const isVideo = contentType.startsWith("video/");
  const thumbnail = isVideo ? (
    <VideoThumb url={url} label={t("video")} className="h-44 w-64 max-w-full" />
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
