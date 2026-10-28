"use client";

// The contact panel's Media tab (audit 13): every photo and video of the chat as a grid of small pictures, newest first, a page
// at a time. A tap opens the same viewer the chat uses, with the gallery's pictures as its pages.
import { ImageOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { useChatMedia } from "../use-inbox";
import { VideoThumb } from "./video-thumb";
import { MediaViewerProvider, useOpenMedia } from "./media-viewer";
import type { ChatMessage, MediaLink } from "@travel-crm/contracts/inbox";

function Thumb({ message, link }: { message: ChatMessage; link: MediaLink | undefined }) {
  const t = useTranslations("inbox.panel.media");
  const open = useOpenMedia();
  const isVideo = message.kind === "video";
  return (
    <button
      type="button"
      className="relative aspect-square overflow-hidden rounded-md bg-muted"
      aria-label={isVideo ? t("openVideo") : t("openPhoto")}
      onClick={() => open?.(message.id)}
    >
      {link !== undefined &&
        (isVideo ? (
          <VideoThumb url={link.url} label={t("openVideo")} className="size-full" />
        ) : (
          // A customer's photo from storage, cropped to a square: not an optimised Next image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.url} alt="" className="size-full object-cover" />
        ))}
    </button>
  );
}

export function MediaGallery({ conversationId, customerName }: { conversationId: string; customerName: string }) {
  const t = useTranslations("inbox.panel.media");
  const media = useChatMedia(conversationId);
  if (media.items === undefined) {
    return media.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={media.error}
        retryLabel={t("retry")}
        onRetry={() => void media.refetch()}
      />
    ) : (
      <LoadingRows shape="twoLines" label={t("loading")} />
    );
  }
  if (media.items.length === 0) return <EmptyState icon={ImageOffIcon} message={t("empty")} />;
  // Each page came with its pictures' links: one call for the page, none for a tile.
  const links = Object.assign({}, ...(media.data?.pages.map((page) => page.links) ?? [])) as Record<string, MediaLink>;
  const people = Object.fromEntries(media.data?.pages.flatMap((page) => Object.entries(page.people)) ?? []);
  return (
    // The viewer reads oldest first, as the chat's does.
    <MediaViewerProvider messages={[...media.items].reverse()} customerName={customerName} people={people}>
      <div className="flex flex-col gap-3">
        <ul className="grid grid-cols-3 gap-1.5" aria-label={t("title")}>
          {media.items.map((message) => (
            <li key={message.id}>
              <Thumb message={message} link={links[message.id]} />
            </li>
          ))}
        </ul>
        <ShowMoreButton pages={media} label={t("more")} />
      </div>
    </MediaViewerProvider>
  );
}
