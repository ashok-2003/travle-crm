"use client";

// The full-screen viewer for a chat's photos and videos (audit 2): a tap on one in a bubble opens it here, with zoom (the
// wheel, the buttons, two fingers), the chat's other photos and videos one flick or arrow key away, the sender, the time and
// the caption, and Download. Escape, the back button and a flick down close it. The provider sits over a chat's messages; a
// bubble outside one (no provider) falls back to opening the file in a tab.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useMediaLink } from "../use-inbox";
import { useMessageDownload } from "./use-message-download";
import { useZoom, type Swipe } from "./use-zoom";

const ViewerContext = createContext<((messageId: string) => void) | null>(null);

/** Opens a message's photo or video in the viewer; null where there is no viewer (the caller links to the file instead). */
export const useOpenMedia = () => useContext(ViewerContext);

/** A photo or video whose file we hold, the viewer's pages. */
export const isViewable = (message: ChatMessage) =>
  (message.kind === "image" || message.kind === "video") && message.mediaState === "stored";

function Stage({ message, onSwipe }: { message: ChatMessage; onSwipe: (swipe: Swipe) => void }) {
  const t = useTranslations("inbox.chat.viewer");
  const link = useMediaLink(message.id, true);
  const zoom = useZoom(onSwipe);
  if (link.data === undefined) {
    return link.isError ? <p className="text-label">{t("loadFailed")}</p> : <Spinner aria-label={t("loading")} />;
  }
  if (message.kind === "video") {
    return (
      <video
        key={message.id}
        src={link.data.url}
        controls
        autoPlay
        className="max-h-full max-w-full"
        aria-label={t("video")}
      />
    );
  }
  return (
    <div className="flex size-full touch-none items-center justify-center overflow-hidden" {...zoom.handlers}>
      {/* The customer's photo from storage, shown at its own size and zoomed by hand: not an optimised Next image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={link.data.url}
        alt={message.caption ?? t("photo")}
        draggable={false}
        className="max-h-full max-w-full object-contain select-none"
        style={{
          transform: `translate(${String(zoom.view.x)}px, ${String(zoom.view.y)}px) scale(${String(zoom.view.scale)})`,
        }}
      />
      <div
        className="absolute bottom-20 left-1/2 flex -translate-x-1/2 gap-1"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t("zoomOut")}
          onClick={() => {
            zoom.zoomBy(1 / 1.5);
          }}
        >
          <ZoomOutIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t("zoomIn")}
          onClick={() => {
            zoom.zoomBy(1.5);
          }}
        >
          <ZoomInIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function MediaViewerProvider({
  messages,
  customerName,
  people,
  children,
}: {
  /** The chat's messages, oldest first. */
  messages: readonly ChatMessage[];
  customerName: string;
  /** Each sender's name by user id. */
  people: Record<string, string>;
  children: ReactNode;
}) {
  const t = useTranslations("inbox.chat.viewer");
  const { timeZone } = useMe().organization;
  const pages = useMemo(() => messages.filter(isViewable), [messages]);
  const [openId, setOpenId] = useState<string | null>(null);
  const download = useMessageDownload();
  const index = pages.findIndex((page) => page.id === openId);
  const message = pages[index];
  const close = useCallback(() => {
    setOpenId(null);
  }, []);
  const go = useCallback(
    (step: 1 | -1) => {
      const next = pages[index + step];
      if (next !== undefined) setOpenId(next.id);
    },
    [pages, index],
  );
  const open = useCallback((messageId: string) => {
    setOpenId(messageId);
  }, []);
  const isOpen = message !== undefined;

  // The back button closes the viewer, as it closes a screen: opening it adds one step to the history.
  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ ...(window.history.state as object | null), mediaViewer: true }, "");
    const onPop = () => {
      setOpenId(null);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if ((window.history.state as { mediaViewer?: boolean } | null)?.mediaViewer === true) window.history.back();
    };
  }, [isOpen]);

  const onSwipe = (swipe: Swipe) => {
    if (swipe === "close") close();
    else go(swipe === "next" ? 1 : -1);
  };
  const from =
    message === undefined
      ? ""
      : message.direction === "out"
        ? ((message.sentBy && people[message.sentBy]) ?? t("you"))
        : customerName;
  return (
    <ViewerContext.Provider value={open}>
      {children}
      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] gap-0 rounded-none bg-foreground p-0 text-background sm:max-w-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(1);
            if (event.key === "ArrowLeft") go(-1);
          }}
        >
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("description")}</DialogDescription>
          {message !== undefined && (
            <>
              <div className="flex items-center gap-2 p-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t("from", { name: from })}</p>
                  <p className="text-caption opacity-70">
                    {formatDayTime(new Date(message.occurredAt), { timeZone })}
                    {" · "}
                    {t("position", { index: index + 1, count: pages.length })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-background hover:text-background"
                  aria-label={t("download")}
                  disabled={download.isPending}
                  onClick={() => {
                    download.mutate(message.id);
                  }}
                >
                  <DownloadIcon aria-hidden="true" />
                </Button>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-background hover:text-background"
                    aria-label={t("close")}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </DialogClose>
              </div>
              <div className="relative flex min-h-0 items-center justify-center">
                <Stage key={message.id} message={message} onSwipe={onSwipe} />
                {index > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute left-2"
                    aria-label={t("previous")}
                    onClick={() => {
                      go(-1);
                    }}
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                  </Button>
                )}
                {index < pages.length - 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-2"
                    aria-label={t("next")}
                    onClick={() => {
                      go(1);
                    }}
                  >
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                )}
              </div>
              <p dir="auto" className="min-h-14 p-3 text-center whitespace-pre-wrap">
                {message.caption}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ViewerContext.Provider>
  );
}
