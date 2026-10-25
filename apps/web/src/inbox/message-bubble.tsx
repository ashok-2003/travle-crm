"use client";

// One message of a chat (spec 3.2): the customer's on one side in white, ours on the other in WhatsApp's green,
// with its time and, for ours, who sent it and its state in ticks (a failed one says why and offers Try again). Text is shown as text (links made tappable, never HTML) and
// `dir="auto"` so Hindi and other scripts read from the right side. A photo, video or voice note comes from a presigned
// link; a document is a download; a place is its coordinates and a link to Maps. Nothing is drawn with a border or shadow.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, CopyIcon, FileIcon, ImageIcon, StarIcon, StarOffIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/data/trpc";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { Ticks } from "./ticks";
import { useStar } from "./use-sales-inbox";
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

const failureCodes = [
  "window_closed",
  "not_on_whatsapp",
  "bad_number",
  "rate_limited",
  "tier_limit",
  "provider_down",
  "unsure",
  "paused",
  "not_connected",
  "opted_out",
  "file_missing",
] as const;

/** "Not sent", why in a sentence, and Try again, which puts the same message back in the queue. */
function NotSent({ message }: { message: ChatMessage }) {
  const t = useTranslations("inbox.chat");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const access = useWriteAccess("change");
  const mayReply = useHolds("inbox:reply");
  const retry = useMutation(
    trpc.inbox.retry.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() }),
    }),
  );
  const code = failureCodes.find((known) => known === message.failureCode);
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-label font-medium text-status-bad-ink">{t(`failure.${code ?? "other"}`)}</p>
      <RefusalAlert error={retry.error} />
      {mayReply && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!access.allowed || retry.isPending}
          onClick={() => {
            retry.mutate({ messageId: message.id });
          }}
        >
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

/** Beside a bubble on hover (always on a touch screen): star it for the team, or copy its words. */
function MessageActions({ message }: { message: ChatMessage }) {
  const t = useTranslations("inbox.chat");
  const mayReply = useHolds("inbox:reply");
  const star = useStar();
  const words = message.body ?? message.caption;
  if (!mayReply && words === null) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-60"
          aria-label={t("messageActions")}
        >
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={message.direction === "out" ? "end" : "start"}>
        {mayReply && (
          <DropdownMenuItem
            disabled={star.isPending}
            onSelect={() => {
              star.mutate({ messageId: message.id, on: !message.starred });
            }}
          >
            {message.starred ? <StarOffIcon aria-hidden="true" /> : <StarIcon aria-hidden="true" />}
            {message.starred ? t("unstar") : t("star")}
          </DropdownMenuItem>
        )}
        {words !== null && (
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(words).then(() => toast.success(t("copied")));
            }}
          >
            <CopyIcon aria-hidden="true" />
            {t("copy")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One bubble. `first` is the first of a run from the same side: it gets the tail and the space above it, as in WhatsApp,
 * and later ones in the run sit close under it. The time, the sender's first name and our ticks sit in the bubble's corner.
 */
export function MessageBubble({
  message,
  senderName,
  first,
}: {
  message: ChatMessage;
  senderName: string | null;
  first: boolean;
}) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const ours = message.direction === "out";
  const failed = ours && message.status === "failed";
  const firstName = senderName?.split(/\s+/)[0];
  const media = ["image", "video", "sticker"].includes(message.kind);
  return (
    <li
      className={cn(
        "group flex items-start gap-1 px-3 md:px-[6%]",
        ours ? "flex-row-reverse" : "flex-row",
        first ? "mt-2" : "mt-0.5",
      )}
    >
      <div
        className={cn(
          "relative flex max-w-[min(85%,38rem)] flex-col gap-1 rounded-lg text-body",
          media ? "p-1" : "px-2.5 pt-1.5 pb-1",
          ours ? "bg-chat-bubble-out text-foreground" : "bg-chat-bubble-in text-foreground",
          first && (ours ? "rounded-tr-none" : "rounded-tl-none"),
          // The tail: a small triangle at the top corner, cut with a clip path (no border is drawn).
          first &&
            (ours
              ? "before:absolute before:top-0 before:-right-2 before:size-2 before:bg-chat-bubble-out before:[clip-path:polygon(0_0,100%_0,0_100%)]"
              : "before:absolute before:top-0 before:-left-2 before:size-2 before:bg-chat-bubble-in before:[clip-path:polygon(0_0,100%_0,100%_100%)]"),
        )}
      >
        {message.quoted !== null && (
          <p className={cn("rounded-md px-2 py-1 text-caption", "bg-ink/5 text-muted-foreground")} dir="auto">
            <span className="block font-medium">{t("quoted")}</span>
            <span className="line-clamp-2">
              {message.quoted.body ?? t(message.quoted.kind === "image" ? "photo" : "document")}
            </span>
          </p>
        )}
        <div dir="auto" className={cn("break-words whitespace-pre-wrap script-leading", media && "px-1.5")}>
          <Body message={message} />
          {/* Room for the corner's time, so the last line never runs under it. */}
          {!media && (
            <span
              aria-hidden="true"
              className={cn("inline-block", ours ? (firstName === undefined ? "w-20" : "w-32") : "w-12")}
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
          {message.starred && <StarIcon aria-label={t("starred")} role="img" className="size-3 fill-current" />}
          <span>{formatTime(new Date(message.occurredAt), { timeZone })}</span>
          {ours && !failed && <Ticks status={message.status} className="size-3.5" />}
        </p>
      </div>
      <MessageActions message={message} />
    </li>
  );
}
