"use client";

// The inbox's left side (spec 3.1; sales inbox spec, sections 3 and 5): the search, the filter chips (Waiting for reply,
// the default; Unread; All; Mine; Unassigned; Archived), a tag to narrow by, and the chats, scrolling on their own under
// them. The search takes a name or digits of a phone and is kept in the tab, never the address; so are the chip and tag.
import type { ConversationFilter } from "@travel-crm/contracts/inbox";
import { MessageCircleIcon, SearchXIcon, TagIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchField } from "@/leads/list/search-field";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { ConversationList } from "./conversation-list";
import { useConversations } from "./use-inbox";
import { useTags } from "./use-inbox-tools";
import { PipelineBar } from "./pipeline-bar";
import { useInboxSummary } from "./use-sales-inbox";

const SEARCH_KEY = "inbox.search";
const FILTER_KEY = "inbox.filter";
const TAG_KEY = "inbox.tag";
const ANY_TAG = "any";
const filters = [
  "waiting",
  "unread",
  "all",
  "mine",
  "unassigned",
  "snoozed",
  "archived",
] as const satisfies readonly ConversationFilter[];
const isFilter = (value: string | null): value is ConversationFilter =>
  value !== null && (filters as readonly string[]).includes(value);
const filterLabel = {
  waiting: "filterWaiting",
  unread: "filterUnread",
  all: "filterAll",
  mine: "filterMine",
  unassigned: "filterUnassigned",
  snoozed: "filterSnoozed",
  archived: "filterArchived",
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
  const tags = useTags();
  const [tagChoice, setTagChoice] = useState(() => readTabValue(TAG_KEY) ?? ANY_TAG);
  // A kept tag that was since deleted counts as none.
  const tagId = tags.data?.some((tag) => tag.id === tagChoice) === true ? tagChoice : null;
  const chats = useConversations({ filter, search: search.length >= 2 ? search : "", tagId });
  const summary = useInboxSummary();
  const countOf = (value: ConversationFilter): number | null => {
    const counts = summary.data;
    if (counts === undefined) return null;
    if (value === "waiting") return counts.waiting;
    if (value === "unread") return counts.unread;
    if (value === "mine") return counts.mine;
    if (value === "unassigned") return counts.unassigned;
    if (value === "snoozed") return counts.snoozed;
    return null;
  };

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
      const empty =
        filter === "waiting"
          ? "emptyWaiting"
          : filter === "unread"
            ? "emptyUnread"
            : filter === "archived"
              ? "emptyArchived"
              : filter === "snoozed"
                ? "emptySnoozed"
                : "empty";
      return <EmptyState icon={MessageCircleIcon} message={t(empty)} />;
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
        {summary.data !== undefined && <PipelineBar summary={summary.data} />}
        <div data-inbox-search>
          <SearchField
            initial={search}
            onSearch={setSearch}
            label={t("search")}
            placeholder={t("searchPlaceholder")}
            className="md:w-full"
          />
        </div>
        {/* A phone scrolls the chips sideways and fades the right edge as the cue; wider, they wrap. */}
        <div className="-mx-3 overflow-x-auto px-3 mask-[linear-gradient(to_right,black_calc(100%-2rem),transparent)] md:mask-none">
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t("filters")}
            value={filter}
            onValueChange={(chosen) => {
              if (isFilter(chosen)) setFilter(chosen);
            }}
            className="w-max pb-1 md:w-full md:flex-wrap"
          >
            {filters.map((value) => {
              const count = countOf(value);
              const late = value === "waiting" ? (summary.data?.late ?? 0) : 0;
              return (
                <ToggleGroupItem key={value} value={value} className="gap-1.5 rounded-full px-3">
                  {t(filterLabel[value])}
                  {count !== null && count > 0 && <span className="numbers text-caption">{count}</span>}
                  {late > 0 && (
                    <span
                      className="rounded-full bg-status-bad-dot px-1.5 text-caption font-semibold text-primary-foreground"
                      aria-label={t("lateCount", { count: late })}
                    >
                      {late}
                    </span>
                  )}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>
        {tags.data !== undefined && tags.data.length > 0 && (
          <Select
            value={tagId ?? ANY_TAG}
            onValueChange={(chosen) => {
              setTagChoice(chosen);
              keepTabValue(TAG_KEY, chosen);
            }}
          >
            <SelectTrigger aria-label={t("tagFilter")} className="w-full">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <TagIcon aria-hidden="true" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_TAG}>{t("anyTag")}</SelectItem>
              {tags.data.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">{body()}</ScrollArea>
    </div>
  );
}
