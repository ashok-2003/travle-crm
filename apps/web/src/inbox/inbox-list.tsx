"use client";

// The inbox's left side (spec 3.1; sales inbox spec, sections 3, 5 and design v2): the search, the filter chips and the
// stage, time, tag and (with two numbers) number choices (inbox-filters.tsx), then the chats, scrolling on their own under them. The search takes a
// name or digits of a phone; it and every choice are kept in the tab, never the address. The AI agent page opens it on
// the chats the AI answered (ai-answered-filter.tsx), the one list an address names, by a fixed value.
import { leadStages, type LeadStage } from "@travel-crm/contracts/crm";
import { conversationPeriods, type ConversationFilter, type ConversationPeriod } from "@travel-crm/contracts/inbox";
import { MessageCircleIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchField } from "@/components/search-field";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { AiAnsweredChip, useAiAnsweredAsked, useAiAnsweredFilter } from "./ai-answered-filter";
import { ConversationList } from "./conversation-list";
import { FilterChips, FiltersButton, inboxFilters } from "./inbox-filters";
import { useConversations } from "./use-inbox";
import { useNumbers } from "./use-numbers";
import { useTags } from "./use-inbox-tools";
import { useInboxSummary } from "./use-sales-inbox";

const KEYS = {
  search: "inbox.search",
  filter: "inbox.filter",
  tag: "inbox.tag",
  stage: "inbox.stage",
  period: "inbox.period",
  number: "inbox.number",
};

/** What the tab kept under a key; nothing, and nothing kept any more, when the list starts afresh. */
function keptOrFresh(key: string, fresh: boolean): string | null {
  if (!fresh) return readTabValue(key);
  keepTabValue(key, "");
  return null;
}

/** A value kept in the tab, read back only if it is still one of the allowed. */
function useKept<Value extends string>(key: string, allowed: readonly Value[], fresh: boolean) {
  const [value, setValue] = useState<Value | null>(
    () => allowed.find((one) => one === keptOrFresh(key, fresh)) ?? null,
  );
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
          : filter === "ai_answered"
            ? "aiAnswered.empty"
            : "empty";

export function InboxList({ currentId }: { currentId: string | null }) {
  const t = useTranslations("inbox");
  // The address (?show=) is the browser's alone: what reads it waits in a boundary of its own.
  return (
    <Suspense fallback={<LoadingRows shape="twoLines" label={t("loading")} />}>
      <ChatsFromAddress currentId={currentId} />
    </Suspense>
  );
}

/** The chats, started afresh (a list of its own) when the address asks for the AI's, which it does only once. */
function ChatsFromAddress({ currentId }: { currentId: string | null }) {
  const asked = useAiAnsweredAsked();
  return <Chats key={asked ? "asked" : "kept"} currentId={currentId} asked={asked} />;
}

function Chats({ currentId, asked }: { currentId: string | null; asked: boolean }) {
  const t = useTranslations("inbox");
  const aiAnswered = useAiAnsweredFilter(asked);
  const [filter, setFilter] = useKept<ConversationFilter>(KEYS.filter, inboxFilters, asked);
  const [stage, setStage] = useKept<LeadStage>(KEYS.stage, leadStages, asked);
  const [period, setPeriod] = useKept<ConversationPeriod>(KEYS.period, conversationPeriods, asked);
  const [search, setSearchText] = useState(() => keptOrFresh(KEYS.search, asked) ?? "");
  const setSearch = useCallback((text: string) => {
    setSearchText(text);
    keepTabValue(KEYS.search, text);
  }, []);
  const tags = useTags();
  const [tagChoice, setTagChoice] = useState(() => keptOrFresh(KEYS.tag, asked) ?? "");
  // A kept tag that was since deleted counts as none.
  const tagId = tags.data?.some((tag) => tag.id === tagChoice) === true ? tagChoice : null;
  const numbers = useNumbers();
  const [numberChoice, setNumberChoice] = useState(() => keptOrFresh(KEYS.number, asked) ?? "");
  // The same for a number: one no longer known, or any while the agency has one number live, is none.
  const connectionId = numbers.show && numbers.numbers.some((one) => one.id === numberChoice) ? numberChoice : null;
  // Mine first (owner, 2026-11-22): a member starts on their own chats; All, Unassigned and the rest are a tap away, and
  // the tab keeps whatever they choose.
  const shownFilter = aiAnswered.on ? "ai_answered" : (filter ?? "mine");
  const chats = useConversations({
    filter: shownFilter,
    search: search.length >= 2 ? search : "",
    tagId,
    stage,
    period,
    connectionId,
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
      const narrowed = stage !== null || period !== null || tagId !== null || connectionId !== null;
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
        <div className="flex items-center gap-2">
          <div data-inbox-search className="min-w-0 flex-1">
            <SearchField
              initial={search}
              onSearch={setSearch}
              label={t("search")}
              placeholder={t("searchPlaceholder")}
              className="md:w-full"
            />
          </div>
          <FiltersButton
            stage={stage}
            onStage={setStage}
            period={period}
            onPeriod={setPeriod}
            tagId={tagId}
            onTag={(chosen) => {
              setTagChoice(chosen ?? "");
              keepTabValue(KEYS.tag, chosen ?? "");
            }}
            number={
              numbers.show
                ? {
                    numbers: numbers.numbers,
                    connectionId,
                    onChange: (chosen) => {
                      setNumberChoice(chosen ?? "");
                      keepTabValue(KEYS.number, chosen ?? "");
                    },
                  }
                : null
            }
            summary={summary.data}
            onClear={() => {
              setStage(null);
              setPeriod(null);
              setTagChoice("");
              keepTabValue(KEYS.tag, "");
              setNumberChoice("");
              keepTabValue(KEYS.number, "");
            }}
          />
        </div>
        {aiAnswered.on && <AiAnsweredChip onRemove={aiAnswered.clear} />}
        <FilterChips
          value={shownFilter}
          onChange={(chosen) => {
            aiAnswered.clear();
            setFilter(chosen);
          }}
          summary={summary.data}
        />
      </div>
      {/* Radix lays the scrolled content out as a table, which a long message widens; a block keeps it the list's width. */}
      <ScrollArea data-chat-list className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        {body()}
      </ScrollArea>
    </div>
  );
}
