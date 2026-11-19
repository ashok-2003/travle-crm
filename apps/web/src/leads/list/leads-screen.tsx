"use client";

// Leads (spec 3.3): everyone who asked about a trip, newest first, in numbered pages (web revamp part 3: 20 a page by
// default, 10 to 100, the bar under the list). Mine · open by default; managers (leads:view on everyone's) switch Mine
// and Everyone with Tabs and filter by owner; everyone searches by name or phone, picks a stage chip, or opens Filters
// beside the search. The filters and the page live in the address (R41), and each row's link carries them for the way
// back; any other list starts at its page 1, at the same size, and a page past the last moves to the last. The search
// never goes there, as a name or a phone in a URL reaches the access logs (use-list-search.ts). A phone gets a divided
// list, a computer the Table (R44); loading shows skeleton rows, another page keeps the rows in view, faded, until it
// arrives; a failure says so with Try again (a refusal its reason), and an empty list says what belongs here or that
// nothing matches. Whoever may block a contact finds Blocked contacts at the end, whether or not they may open
// Settings, which also leads there. A polite status says which leads are shown of how many, or that a search or filter
// found none, so screen readers hear each answer.
import { ContactIcon, SearchXIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { pageRange, TablePagination } from "@/components/table-pagination";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useWideScreen } from "@/lib/use-wide-screen";
import { cn } from "@/lib/utils";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { BulkBar } from "./bulk/bulk-bar";
import { useLeadSelection } from "./bulk/use-lead-selection";
import { FiltersDialog } from "./filters-dialog";
import { LeadRows } from "./lead-rows";
import { LeadsHeaderActions } from "./leads-header-actions";
import { LeadsTable, tableColumns } from "./leads-table";
import { isFiltered, listFiltersHref, listFiltersOf, PAGE_SIZES, type FiltersToShow } from "./list-filters";
import { SearchField } from "./search-field";
import { isChipStage, StageChips } from "./stage-chips";
import { useLeadCounts, useLeadPage, useUnassignedCount } from "./use-leads";
import { useListSearch } from "./use-list-search";

export function LeadsScreen() {
  const t = useTranslations("leads.list");
  const tCommon = useTranslations("common");
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const router = useRouter();
  const filters = listFiltersOf(useSearchParams(), ownOnly ? "own" : "all");
  const [search, setSearch] = useListSearch();
  const input = { ...filters, ...(search !== "" && { search }) };
  const leads = useLeadPage(input);
  const counts = useLeadCounts(input);
  // Only someone who assigns leads works the queue, so only they are told how many wait in it.
  const assigns = useHolds("leads:assign");
  const waiting = useUnassignedCount(!ownOnly && assigns);
  const wide = useWideScreen();
  // On a computer, whoever may change leads chooses some for a bulk change. The choice stays on the list's other pages
  // and at another size; a new filter or search starts afresh.
  const bulk = useHolds("leads:edit") && wide;
  const selection = useLeadSelection(JSON.stringify({ ...input, page: undefined, limit: undefined }));
  const blockedContacts = assigns && <TextLink href={routes.blockedContacts}>{t("blockedContacts")}</TextLink>;
  // Clear filters empties the search box too, by giving it a fresh start.
  const [searchBox, setSearchBox] = useState(0);
  const total = leads.data?.total ?? 0;
  const range = pageRange(filters.page, filters.limit, total);
  // The rows in view are this page's, not the last one's kept while it loads.
  const settled = leads.data !== undefined && !leads.isPlaceholderData;
  // A page past the last (a kept link; the last page's leads all removed) moves to the last.
  const pastTheEnd = settled && total > 0 && filters.page > range.pages;
  const lastPage = listFiltersHref({ ...filters, page: range.pages });
  useEffect(() => {
    if (pastTheEnd) router.replace(lastPage);
  }, [pastTheEnd, lastPage, router]);
  // With no leads at all, a chip row of zeros says nothing the empty list doesn't: the chips go without counts.
  const noLeadsAtAll = leads.data?.total === 0 && !isFiltered(input);
  const shown = !settled
    ? null
    : total > 0
      ? t("found", { from: formatCount(range.from), to: formatCount(range.to), total })
      : isFiltered(input)
        ? t("emptyFiltered")
        : null;

  /** Another list: its first page, at the same size. */
  const show = (next: FiltersToShow) => {
    router.replace(listFiltersHref({ ...next, page: undefined, limit: filters.limit }));
  };
  /** Another page or size of this list, a step in the history so Back and Forward walk them. */
  const go = (page: number, limit = filters.limit) => {
    router.push(listFiltersHref({ ...filters, page, limit }));
  };
  const searchFor = (text: string) => {
    setSearch(text);
    if (filters.page !== 1) show(filters);
  };
  const clear = () => {
    show({ view: filters.view });
    setSearch("");
    setSearchBox((box) => box + 1);
  };

  const loading = (
    <LoadingRows shape={wide ? "table" : "twoLines"} columns={tableColumns(!ownOnly).length} label={t("loading")} />
  );
  const body = (): ReactNode => {
    if (leads.data === undefined) {
      if (leads.isError) {
        return (
          <ErrorState
            message={t("loadFailed")}
            error={leads.error}
            retryLabel={tCommon("tryAgain")}
            onRetry={() => void leads.refetch()}
          />
        );
      }
      return loading;
    }
    const { items, people } = leads.data;
    if (items.length === 0) {
      // Past the last page: the list moves to it.
      if (total > 0) return loading;
      if (isFiltered(input)) {
        const clearButton = (
          <Button variant="outline" onClick={clear}>
            {t("clearFilters")}
          </Button>
        );
        return <EmptyState icon={SearchXIcon} message={t("emptyFiltered")} action={clearButton} />;
      }
      // The header's New lead sits just above: one primary button per screen (DESIGN.md section 6).
      const empty = ownOnly ? t("emptyMine") : filters.view === "unassigned" ? t("emptyUnassigned") : t("empty");
      return <EmptyState icon={ContactIcon} message={empty} />;
    }
    return (
      <div className="flex flex-col gap-4">
        {bulk && <BulkBar selection={selection} />}
        <div
          aria-busy={leads.isPlaceholderData}
          className={cn("motion-safe:transition-opacity", leads.isPlaceholderData && "opacity-60")}
        >
          {wide ? (
            <LeadsTable
              leads={items}
              people={people}
              filters={filters}
              showOwner={!ownOnly}
              {...(bulk && { selection })}
            />
          ) : (
            <LeadRows leads={items} filters={filters} />
          )}
        </div>
        <TablePagination
          page={filters.page}
          size={filters.limit}
          total={total}
          noun={t("pageNoun", { count: total })}
          sizes={PAGE_SIZES}
          busy={leads.isPlaceholderData}
          onPage={go}
          onSize={(size) => {
            // The page that holds the first lead shown, at the new size.
            go(Math.floor(Math.max(range.from - 1, 0) / size) + 1, size);
          }}
        />
      </div>
    );
  };

  const toolbar = (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      {!ownOnly && (
        <TabsList className="w-full md:w-fit" aria-label={t("whose")}>
          <TabsTrigger value="mine">{t("mine")}</TabsTrigger>
          <TabsTrigger value="everyone">{t("everyone")}</TabsTrigger>
          <TabsTrigger value="unassigned">
            {waiting === null || waiting === 0 ? t("unassigned") : t("unassignedWaiting", { count: waiting })}
          </TabsTrigger>
        </TabsList>
      )}
      {/* Filters sits beside the search, in view on a phone rather than at the end of the chips' strip. */}
      <div className="flex gap-2">
        <SearchField key={searchBox} initial={search} onSearch={searchFor} className="min-w-0 flex-1 md:flex-none" />
        <FiltersDialog filters={filters} chipShown={isChipStage(filters.stage)} ownOnly={ownOnly} onApply={show} />
      </div>
      {/* Always there, so a change in it is heard; the list itself says it to the eye. */}
      <p role="status" className="sr-only">
        {shown}
      </p>
      {/* The chips scroll sideways in their own strip on a phone (R42) and wrap on a wider screen, a line of their own;
          the padding keeps their focus outline in view. */}
      <div className="-m-1 overflow-x-auto p-1 md:w-full md:overflow-visible">
        <StageChips
          stage={filters.stage}
          counts={noLeadsAtAll ? undefined : counts.data}
          ownOnly={ownOnly}
          onChoose={(stage) => {
            show({ ...filters, stage });
          }}
        />
      </div>
      {counts.isError && (
        // The chips still filter without their counts; a line says they didn't load, with Try again. A refusal would
        // refuse the list too, whose own error says its reason.
        <LoadFailedAlert message={t("countsFailed")} error={null} onRetry={() => void counts.refetch()} />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} action={<LeadsHeaderActions />} />
      {ownOnly ? (
        <div className="flex flex-col gap-6">
          {toolbar}
          {body()}
        </div>
      ) : (
        <Tabs
          value={filters.view}
          onValueChange={(view) => {
            show({
              ...filters,
              view: view === "everyone" || view === "unassigned" ? view : "mine",
              ownerUserId: undefined,
            });
          }}
          className="gap-6"
        >
          {toolbar}
          <TabsContent value={filters.view} className="text-base">
            {body()}
          </TabsContent>
        </Tabs>
      )}
      {blockedContacts}
    </div>
  );
}
