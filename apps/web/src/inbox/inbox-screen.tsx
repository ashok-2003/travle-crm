"use client";

// /inbox and /inbox/<id> (spec 3.1): the shared WhatsApp inbox. On a computer the list is on the left and the chat on the
// right; on a phone the list, and a tap opens the chat on a page of its own with a way back. The chips choose Waiting for
// reply (the default), All or Mine; the search takes a name or digits of a phone and is kept in the tab, never the address.
// The states: WhatsApp not set up for the agency (never naming MSG91), no chats yet, the connection in trouble or paused,
// the demo (read only), a load that failed with Try again.
import { MessageCircleIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchField } from "@/leads/list/search-field";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { routes } from "@/lib/routes";
import { useWideScreen } from "@/lib/use-wide-screen";
import { ChatPanel } from "./chat-panel";
import { ConversationList } from "./conversation-list";
import { NotSetUp } from "./not-set-up";
import { useConversations, useInboxStatus } from "./use-inbox";

const SEARCH_KEY = "inbox.search";
const filters = ["waiting", "all", "mine"] as const;
type Filter = (typeof filters)[number];
const isFilter = (value: string): value is Filter => (filters as readonly string[]).includes(value);

function List({ currentId }: { currentId: string | null }) {
  const t = useTranslations("inbox");
  const [filter, setFilter] = useState<Filter>("waiting");
  const [search, setSearchText] = useState(() => readTabValue(SEARCH_KEY) ?? "");
  const setSearch = useCallback((text: string) => {
    setSearchText(text);
    keepTabValue(SEARCH_KEY, text);
  }, []);
  const chats = useConversations({ filter, search: search.length >= 2 ? search : "" });

  const body = () => {
    if (chats.items === undefined) {
      return chats.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={chats.error}
          retryLabel={t("chat.retry")}
          onRetry={() => void chats.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    if (chats.items.length === 0) {
      if (search.length >= 2) return <EmptyState icon={SearchXIcon} message={t("emptySearch")} />;
      return <EmptyState icon={MessageCircleIcon} message={filter === "waiting" ? t("emptyWaiting") : t("empty")} />;
    }
    return (
      <div className="flex flex-col gap-4">
        <ConversationList items={chats.items} currentId={currentId} />
        <ShowMoreButton pages={chats} label={t("showMore")} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <SearchField initial={search} onSearch={setSearch} />
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={t("filters")}
        value={filter}
        onValueChange={(chosen) => {
          if (isFilter(chosen)) setFilter(chosen);
        }}
      >
        <ToggleGroupItem value="waiting">{t("filterWaiting")}</ToggleGroupItem>
        <ToggleGroupItem value="all">{t("filterAll")}</ToggleGroupItem>
        <ToggleGroupItem value="mine">{t("filterMine")}</ToggleGroupItem>
      </ToggleGroup>
      {body()}
    </div>
  );
}

export function InboxScreen({ conversationId }: { conversationId: string | null }) {
  const t = useTranslations("inbox");
  const wide = useWideScreen();
  const status = useInboxStatus();

  if (status.data === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} intro={t("intro")} />
        {status.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={status.error}
            retryLabel={t("chat.retry")}
            onRetry={() => void status.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )}
      </div>
    );
  }
  const { configured, connected, connectionStatus, demo } = status.data;
  const notice =
    connectionStatus === "problem"
      ? t("problem")
      : connectionStatus === "paused"
        ? t("paused")
        : demo
          ? t("demo")
          : null;

  const content = () => {
    if (!configured || !connected) return <NotSetUp />;
    if (!wide) {
      return conversationId === null ? (
        <List currentId={null} />
      ) : (
        <div className="flex flex-col gap-4">
          <BackLink href={routes.inbox} label={t("back")} />
          <ChatPanel conversationId={conversationId} />
        </div>
      );
    }
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <List currentId={conversationId} />
        {conversationId === null ? (
          <EmptyState icon={MessageCircleIcon} message={t("pickChat")} />
        ) : (
          <ChatPanel conversationId={conversationId} />
        )}
      </div>
    );
  };

  return (
    <div className="flex max-w-[1200px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      {notice !== null && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {content()}
    </div>
  );
}
