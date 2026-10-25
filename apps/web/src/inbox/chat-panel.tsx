"use client";

// One chat (spec 3.2; sales inbox spec, sections 3 and 4), as WhatsApp lays it out: the bar with the person atop, the
// messages on a quiet wallpaper (oldest at the top, a page at a time upward), and the reply bar pinned under them. Beside
// it on a wide screen, the contact panel where the sale is worked; on a phone that panel opens as a sheet. Inside a lead's
// page (`lead`) only the messages and the reply bar, in a box of their own height. The messages refetch while it is open.
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { refusalOf } from "@/data/api-error";
import { formatPhoneNumber } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ChatHeader } from "./chat-header";
import { ContactPanel } from "./contact-panel";
import { MessageList } from "./message-list";
import { ReplyArea } from "./reply-area";
import { useConversation } from "./use-inbox";

/**
 * `inbox`: beside the list on a computer; `page`: a phone's chat, covering the screen; `lead`: inside the lead's page,
 * which already shows the person and the sale, so only the chat.
 */
export type ChatVariant = "inbox" | "page" | "lead";

export function ChatPanel({ conversationId, variant = "inbox" }: { conversationId: string; variant?: ChatVariant }) {
  const t = useTranslations("inbox.chat");
  const header = useConversation(conversationId);
  // The panel sits beside the chat where there is room for both (1280px), and opens over it elsewhere.
  const roomy = useMediaQuery("(min-width: 1280px)");
  const [panelChoice, setPanelChoice] = useState<boolean | null>(null);
  const panelOpen = panelChoice ?? roomy;
  const panelButton = useRef<HTMLButtonElement>(null);

  if (header.data === undefined) {
    const state = (() => {
      if (!header.valid || refusalOf(header.error)?.reason === "NOT_FOUND") {
        return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
      }
      if (header.isError) {
        return (
          <ErrorState
            message={t("loadFailed")}
            error={header.error}
            retryLabel={t("retry")}
            onRetry={() => void header.refetch()}
          />
        );
      }
      return <LoadingRows shape="twoLines" label={t("loading")} />;
    })();
    return <div className="p-4">{state}</div>;
  }
  const data = header.data;
  const chat = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {variant !== "lead" && (
        <ChatHeader
          header={data}
          asPage={variant === "page"}
          panelOpen={panelOpen}
          onTogglePanel={() => {
            setPanelChoice(!panelOpen);
          }}
          panelButton={panelButton}
        />
      )}
      {/* The wallpaper: messages scroll inside it while the reply bar stays at its foot. */}
      <div className="relative min-h-0 flex-1 bg-surface">
        <MessageList conversationId={data.id} />
      </div>
      <div className="shrink-0 bg-surface px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4">
        <ReplyArea header={data} />
      </div>
    </div>
  );
  const name = data.name ?? formatPhoneNumber(data.phone);
  return (
    <section
      className={cn("flex min-h-0 min-w-0", variant === "lead" ? "h-[32rem] overflow-hidden rounded-lg" : "h-full")}
      aria-label={t("region", { name })}
    >
      {chat}
      {variant !== "lead" && roomy && panelOpen && (
        <>
          <Separator orientation="vertical" />
          <aside className="w-[22rem] shrink-0 bg-background">
            <ContactPanel
              header={data}
              onClose={() => {
                setPanelChoice(false);
                panelButton.current?.focus();
              }}
            />
          </aside>
        </>
      )}
      {variant !== "lead" && !roomy && (
        <Sheet
          open={panelOpen}
          onOpenChange={(open) => {
            setPanelChoice(open);
          }}
        >
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            <SheetTitle className="sr-only">{name}</SheetTitle>
            <ContactPanel header={data} />
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
