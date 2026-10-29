"use client";

// The quote inside a bubble (audit 8): who wrote the original, a small picture or the kind of thing it was, and its first words.
// A tap goes to the original in the chat. An original we never had says so, instead of showing nothing.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import {
  CircleHelpIcon,
  FileIcon,
  ImageIcon,
  MapPinIcon,
  MessageSquareIcon,
  MicIcon,
  UserRoundIcon,
  VideoIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useChatJump } from "./chat-jump";
import { useMediaLink } from "./use-inbox";

type Quoted = NonNullable<ChatMessage["quoted"]>;

/** The kind's icon, drawn where it stands (a component picked in render would be remade on every render). */
function KindIcon({ kind }: { kind: NonNullable<Quoted["kind"]> }) {
  const className = "size-3.5 shrink-0";
  switch (kind) {
    case "image":
    case "sticker":
      return <ImageIcon aria-hidden="true" className={className} />;
    case "video":
      return <VideoIcon aria-hidden="true" className={className} />;
    case "audio":
      return <MicIcon aria-hidden="true" className={className} />;
    case "document":
      return <FileIcon aria-hidden="true" className={className} />;
    case "location":
      return <MapPinIcon aria-hidden="true" className={className} />;
    case "contacts":
      return <UserRoundIcon aria-hidden="true" className={className} />;
    default:
      return <MessageSquareIcon aria-hidden="true" className={className} />;
  }
}

const kindLabels = {
  text: "text",
  template: "template",
  image: "image",
  sticker: "sticker",
  video: "video",
  audio: "audio",
  document: "document",
  location: "location",
  contacts: "contacts",
  reaction: "unsupported",
  unsupported: "unsupported",
} as const;

export function QuoteBlock({ quoted, senderName }: { quoted: Quoted; senderName: string }) {
  const t = useTranslations("inbox.chat.quote");
  const { jumpTo } = useChatJump();
  const photo = useMediaLink(quoted.messageId ?? "", quoted.kind === "image" && quoted.mediaState === "stored");
  if (quoted.messageId === null || quoted.kind === null) {
    return (
      <p className="flex items-center gap-1.5 rounded-md bg-ink/5 px-2 py-1 text-caption text-muted-foreground italic">
        <CircleHelpIcon aria-hidden="true" className="size-3.5 shrink-0" />
        {t("unavailable")}
      </p>
    );
  }
  const { messageId } = quoted;
  const words = quoted.body ?? quoted.fileName;
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md bg-ink/5 px-2 py-1 text-left text-caption text-muted-foreground"
      aria-label={t("goTo", { name: senderName })}
      onClick={() => {
        jumpTo(messageId);
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col" dir="auto">
        <span className="truncate font-medium text-foreground">{senderName}</span>
        <span className="flex min-w-0 items-center gap-1">
          {words === null || quoted.kind !== "text" ? (
            <>
              <KindIcon kind={quoted.kind} />
              <span className="truncate">{words ?? t(`kinds.${kindLabels[quoted.kind]}`)}</span>
            </>
          ) : (
            <span className="line-clamp-2">{words}</span>
          )}
        </span>
      </span>
      {photo.data !== undefined && (
        // The customer's own photo, scaled down: not an optimised Next image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.data.url} alt="" className="size-10 shrink-0 rounded-sm object-cover" />
      )}
    </button>
  );
}
