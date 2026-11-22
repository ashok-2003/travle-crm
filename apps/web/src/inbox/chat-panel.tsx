"use client";

// One chat (spec 3.2; sales inbox spec, sections 3 and 4), as WhatsApp lays it out: the bar with the person atop, the
// messages on a quiet wallpaper (oldest at the top, a page at a time upward), and the reply bar pinned under them. Beside
// it in the Inbox, where it fits without squeezing the chat under 520px (inbox-panes.tsx), the contact panel where the sale
// is worked, open or shut as the member keeps it; where it doesn't fit, and on a phone, the panel floats over the chat's
// right edge as a sheet when asked for. Inside a lead's page (`lead`) only the messages and the reply bar, in a box of their
// own height.
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type CSSProperties } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { refusalOf } from "@/data/api-error";
import { formatPhoneNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { ChatDropZone } from "./chat-drop";
import { ChatHeader } from "./chat-header";
import { ChatSearchBar } from "./chat-search-bar";
import { ContactPanel } from "./contact-panel";
import { useInboxPanes } from "./inbox-panes";
import { MessageList } from "./message-list";
import { ReplyArea } from "./reply-area";
import { ReplyingProvider } from "./use-replying";
import { useConversation, type MessageFilter } from "./use-inbox";

/**
 * `inbox`: beside the list on a computer; `page`: a phone's chat, covering the screen; `lead`: inside the lead's page,
 * which already shows the person and the sale, so only the chat.
 */
export type ChatVariant = "inbox" | "page" | "lead";

export function ChatPanel({ conversationId, variant = "inbox" }: { conversationId: string; variant?: ChatVariant }) {
  const t = useTranslations("inbox.chat");
  const header = useConversation(conversationId);
  const panes = useInboxPanes();
  // Beside the chat, the panel is as the member keeps it; floating, it opens only when asked for, for this chat.
  const docked = variant === "inbox" && panes?.panelDocks === true;
  const [floatingOpen, setFloatingOpen] = useState(false);
  const panelOpen = docked ? panes.panelOpen : floatingOpen;
  const setPanelOpen = docked ? panes.setPanelOpen : setFloatingOpen;
  const panelButton = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<MessageFilter>({ search: "", starredOnly: false });
  const settledSearch = useDebouncedValue(filter.search);
  const shownFilter: MessageFilter = searchOpen
    ? { search: settledSearch.trim(), starredOnly: filter.starredOnly }
    : { search: "", starredOnly: false };

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
    <ReplyingProvider conversationId={data.id}>
      <ChatDropZone className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {variant !== "lead" && (
          <ChatHeader
            header={data}
            asPage={variant === "page"}
            panelOpen={panelOpen}
            onTogglePanel={() => {
              setPanelOpen(!panelOpen);
            }}
            panelButton={panelButton}
            searchOpen={searchOpen}
            onToggleSearch={() => {
              setSearchOpen(!searchOpen);
            }}
          />
        )}
        {searchOpen && (
          <ChatSearchBar
            filter={filter}
            onChange={setFilter}
            onClose={() => {
              setSearchOpen(false);
            }}
          />
        )}
        {/* The wallpaper: messages scroll inside it while the reply bar stays at its foot. */}
        <div className="relative min-h-0 flex-1 bg-chat-wallpaper">
          <MessageList key={data.id} conversationId={data.id} filter={shownFilter} />
        </div>
        <div className="shrink-0 bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4">
          <ReplyArea header={data} />
        </div>
      </ChatDropZone>
    </ReplyingProvider>
  );
  const name = data.name ?? formatPhoneNumber(data.phone);
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0",
        // On the lead's page: a preview on a phone, and tall beside the timeline on a computer (two-thirds of the screen).
        variant === "lead" ? "h-96 overflow-hidden rounded-lg md:h-128 xl:h-[max(32rem,66svh)]" : "h-full",
      )}
      aria-label={t("region", { name })}
    >
      {chat}
      {docked && panelOpen && (
        <>
          <Separator orientation="vertical" />
          <aside data-contact-panel className="shrink-0 bg-background" style={{ width: panes.panelWidth }}>
            <ContactPanel
              header={data}
              onClose={() => {
                setPanelOpen(false);
                panelButton.current?.focus();
              }}
            />
          </aside>
        </>
      )}
      {variant !== "lead" && !docked && (
        <Sheet
          open={panelOpen}
          onOpenChange={(open) => {
            setPanelOpen(open);
          }}
        >
          <SheetContent
            side="right"
            // As wide as it would be beside the chat, over the chat's right edge; a phone's screen wide.
            style={
              panes === null || variant === "page"
                ? undefined
                : ({ "--panel-width": `${String(panes.panelWidth)}px` } as CSSProperties)
            }
            className={cn(
              "p-0 data-[side=right]:w-full",
              panes === null || variant === "page"
                ? "data-[side=right]:sm:max-w-md"
                : "data-[side=right]:w-(--panel-width) data-[side=right]:sm:max-w-none",
            )}
          >
            <SheetTitle className="sr-only">{name}</SheetTitle>
            <ContactPanel header={data} />
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
