"use client";

// The inbox's left side (spec 3.1; sales inbox spec, section 3): the search, the filter chips (Waiting for reply, the
// default; All; Mine; Unassigned) and the chats, scrolling on their own under them. The search takes a name or digits of
// a phone and is kept in the tab, never the address.
import type { ConversationFilter } from "@travel-crm/contracts/inbox";
import { MessageCircleIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchField } from "@/leads/list/search-field";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { ConversationList } from "./conversation-list";
import { useConversations } from "./use-inbox";

const SEARCH_KEY = "inbox.search";
const FILTER_KEY = "inbox.filter";
const filters = ["waiting", "all", "mine", "unassigned"] as const satisfies readonly ConversationFilter[];
const isFilter = (value: string | null): value is ConversationFilter =>
  value !== null && (filters as readonly string[]).includes(value);
const filterLabel = {
  waiting: "filterWaiting",
  all: "filterAll",
  mine: "filterMine",
  unassigned: "filterUnassigned",
} as const;

export function InboxList({ currentId }: { currentId: string | null }) {
  const t = useTranslations("inbox");
  const [filter, setFilterValue] = useState<ConversationFilter>(() => {
    const kept = readTabValue(FILTER_KEY);
    return isFilter(kept) ? kept : "waiting";
  });
  const [search, setSearchText] = useState(() => readTabValue(SEARCH_KEY) ?? "");
  const setSearch = useCallback((text: string) => {
    setSearchText(text);
    keepTabValue(SEARCH_KEY, text);
  }, []);
  const setFilter = (chosen: ConversationFilter) => {
    setFilterValue(chosen);
    keepTabValue(FILTER_KEY, chosen);
  };
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
      <div className="flex flex-col gap-3 pb-4">
        <ConversationList items={chats.items} currentId={currentId} />
        <div className="px-3">
          <ShowMoreButton pages={chats} label={t("showMore")} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-3 pt-3 pb-2">
        <SearchField
          initial={search}
          onSearch={setSearch}
          label={t("search")}
          placeholder={t("searchPlaceholder")}
          className="md:w-full"
        />
        <div className="-mx-3 overflow-x-auto px-3">
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t("filters")}
            value={filter}
            onValueChange={(chosen) => {
              if (isFilter(chosen)) setFilter(chosen);
            }}
            className="w-max pb-1"
          >
            {filters.map((value) => (
              <ToggleGroupItem key={value} value={value} className="rounded-full px-3">
                {t(filterLabel[value])}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">{body()}</ScrollArea>
    </div>
  );
}
