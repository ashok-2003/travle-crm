"use client";

// The inbox's left side (spec 3.1; sales inbox spec, sections 3, 5 and design v2): the search, the filter chips and the
// stage, time and tag choices (inbox-filters.tsx), then the chats, scrolling on their own under them. The search takes a
// name or digits of a phone; it and every choice are kept in the tab, never the address.
import { leadStages, type LeadStage } from "@travel-crm/contracts/crm";
import { conversationPeriods, type ConversationFilter, type ConversationPeriod } from "@travel-crm/contracts/inbox";
import { MessageCircleIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchField } from "@/leads/list/search-field";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { ConversationList } from "./conversation-list";
import { FilterChips, FilterChoices, inboxFilters } from "./inbox-filters";
import { useConversations } from "./use-inbox";
import { useTags } from "./use-inbox-tools";
import { useInboxSummary } from "./use-sales-inbox";

const KEYS = {
  search: "inbox.search",
  filter: "inbox.filter",
  tag: "inbox.tag",
  stage: "inbox.stage",
  period: "inbox.period",
};

/** A value kept in the tab, read back only if it is still one of the allowed. */
function useKept<Value extends string>(key: string, allowed: readonly Value[]) {
  const [value, setValue] = useState<Value | null>(() => allowed.find((one) => one === readTabValue(key)) ?? null);
  const keep = (next: Value | null) => {
    setValue(next);
    keepTabValue(key, next ?? "");
  };
  return [value, keep] as const;
}

/** What an empty list says, by its chip. */
const emptyKeyOf = (filter: ConversationFilter) =>
  filter === "waiting"
    ? "emptyWaiting"
    : filter === "unread"
      ? "emptyUnread"
      : filter === "archived"
        ? "emptyArchived"
        : filter === "snoozed"
          ? "emptySnoozed"
          : "empty";

export function InboxList({ currentId }: { currentId: string | null }) {
  const t = useTranslations("inbox");
  const [filter, setFilter] = useKept<ConversationFilter>(KEYS.filter, inboxFilters);
  const [stage, setStage] = useKept<LeadStage>(KEYS.stage, leadStages);
  const [period, setPeriod] = useKept<ConversationPeriod>(KEYS.period, conversationPeriods);
  const [search, setSearchText] = useState(() => readTabValue(KEYS.search) ?? "");
  const setSearch = useCallback((text: string) => {
    setSearchText(text);
    keepTabValue(KEYS.search, text);
  }, []);
  const tags = useTags();
  const [tagChoice, setTagChoice] = useState(() => readTabValue(KEYS.tag) ?? "");
  // A kept tag that was since deleted counts as none.
  const tagId = tags.data?.some((tag) => tag.id === tagChoice) === true ? tagChoice : null;
  const shownFilter = filter ?? "all";
  const chats = useConversations({
    filter: shownFilter,
    search: search.length >= 2 ? search : "",
    tagId,
    stage,
    period,
  });
  const summary = useInboxSummary();

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
      const narrowed = stage !== null || period !== null || tagId !== null;
      return <EmptyState icon={MessageCircleIcon} message={t(narrowed ? "emptyChoices" : emptyKeyOf(shownFilter))} />;
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
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-2 pb-2">
        <div data-inbox-search>
          <SearchField
            initial={search}
            onSearch={setSearch}
            label={t("search")}
            placeholder={t("searchPlaceholder")}
            className="md:w-full"
          />
        </div>
        <FilterChips value={shownFilter} onChange={setFilter} summary={summary.data} />
        <FilterChoices
          stage={stage}
          onStage={setStage}
          period={period}
          onPeriod={setPeriod}
          tagId={tagId}
          onTag={(chosen) => {
            setTagChoice(chosen ?? "");
            keepTabValue(KEYS.tag, chosen ?? "");
          }}
          summary={summary.data}
        />
      </div>
      {/* Radix lays the scrolled content out as a table, which a long message widens; a block keeps it the list's width. */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">{body()}</ScrollArea>
    </div>
  );
}
