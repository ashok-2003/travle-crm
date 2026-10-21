"use client";

// Leads (spec 3.3): everyone who asked about a trip, newest first, a page at a time. Mine · open by default; managers
// (leads:view on everyone's) switch Mine and Everyone with Tabs and filter by owner; everyone searches by name or
// phone, picks a stage chip, or opens Filters. The filters live in the address (R41), and each row's link carries them
// for the way back; the search never does, as a name or a phone in a URL reaches the access logs (use-list-search.ts).
// A phone gets a divided list, a computer the Table (R44); loading shows skeleton rows, a failure says so with Try
// again (a refusal its reason), and an empty list says what belongs here or that nothing matches. Whoever may block a
// contact finds Blocked contacts at the end, whether or not they may open Settings, which also leads there. A polite
// status says how many leads are shown, or that a search or filter found none, so screen readers hear each answer.
import { ContactIcon, SearchXIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/lib/routes";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { BulkBar } from "./bulk/bulk-bar";
import { useLeadSelection } from "./bulk/use-lead-selection";
import { FiltersDialog } from "./filters-dialog";
import { LeadRows } from "./lead-rows";
import { LeadsHeaderActions } from "./leads-header-actions";
import { LeadsTable, tableColumns } from "./leads-table";
import { isFiltered, listFiltersHref, listFiltersOf, type FiltersToShow } from "./list-filters";
import { SearchField } from "./search-field";
import { isChipStage, StageChips } from "./stage-chips";
import { useLeadCounts, useLeads } from "./use-leads";
import { useListSearch } from "./use-list-search";

export function LeadsScreen() {
  const t = useTranslations("leads.list");
  const tCommon = useTranslations("common");
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const router = useRouter();
  const filters = listFiltersOf(useSearchParams(), ownOnly ? "own" : "all");
  const [search, setSearch] = useListSearch();
  const input = { ...filters, ...(search !== "" && { search }) };
  const leads = useLeads(input);
  const counts = useLeadCounts(input);
  const wide = useWideScreen();
  // On a computer, whoever may change leads chooses some for a bulk change; a new filter or search starts afresh.
  const bulk = useHolds("leads:edit") && wide;
  const selection = useLeadSelection(JSON.stringify(input));
  const blockedContacts = useHolds("leads:assign") && (
    <TextLink href={routes.blockedContacts}>{t("blockedContacts")}</TextLink>
  );
  // Clear filters empties the search box too, by giving it a fresh start.
  const [searchBox, setSearchBox] = useState(0);
  // With no leads at all, a chip row of zeros says nothing the empty list doesn't: the chips go without counts.
  const noLeadsAtAll = leads.items?.length === 0 && !isFiltered(input);
  const shown =
    leads.items === undefined
      ? null
      : leads.items.length > 0
        ? t("found", { count: leads.items.length, more: leads.hasNextPage ? "yes" : "no" })
        : isFiltered(input)
          ? t("emptyFiltered")
          : null;

  const show = (next: FiltersToShow) => {
    router.replace(listFiltersHref(next));
  };
  const clear = () => {
    show({ view: filters.view });
    setSearch("");
    setSearchBox((box) => box + 1);
  };

  const body = (): ReactNode => {
    if (leads.items === undefined) {
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
      return (
        <LoadingRows shape={wide ? "table" : "twoLines"} columns={tableColumns(!ownOnly).length} label={t("loading")} />
      );
    }
    if (leads.items.length === 0) {
      if (isFiltered(input)) {
        const clearButton = (
          <Button variant="outline" onClick={clear}>
            {t("clearFilters")}
          </Button>
        );
        return <EmptyState icon={SearchXIcon} message={t("emptyFiltered")} action={clearButton} />;
      }
      // The header's New lead sits just above: one primary button per screen (DESIGN.md section 6).
      return <EmptyState icon={ContactIcon} message={ownOnly ? t("emptyMine") : t("empty")} />;
    }
    return (
      <div className="flex flex-col gap-4">
        {bulk && <BulkBar selection={selection} />}
        {wide ? (
          <LeadsTable
            leads={leads.items}
            people={leads.people}
            filters={filters}
            showOwner={!ownOnly}
            {...(bulk && { selection })}
          />
        ) : (
          <LeadRows leads={leads.items} filters={filters} />
        )}
        {leads.isFetchNextPageError && <RefusalAlert error={leads.error} />}
        <ShowMoreButton pages={leads} label={t("showMore")} />
      </div>
    );
  };

  const toolbar = (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      {!ownOnly && (
        <TabsList className="w-full md:w-fit" aria-label={t("whose")}>
          <TabsTrigger value="mine">{t("mine")}</TabsTrigger>
          <TabsTrigger value="everyone">{t("everyone")}</TabsTrigger>
        </TabsList>
      )}
      <SearchField key={searchBox} initial={search} onSearch={setSearch} />
      {/* Always there, so a change in it is heard; the list itself says it to the eye. */}
      <p role="status" className="sr-only">
        {shown}
      </p>
      {/* The chips scroll sideways on a phone (R42); the padding keeps their focus outline in view. */}
      <div className="-m-1 flex items-center gap-2 overflow-x-auto p-1 md:flex-wrap md:overflow-visible">
        <StageChips
          stage={filters.stage}
          counts={noLeadsAtAll ? undefined : counts.data}
          ownOnly={ownOnly}
          onChoose={(stage) => {
            show({ ...filters, stage });
          }}
        />
        <FiltersDialog filters={filters} chipShown={isChipStage(filters.stage)} ownOnly={ownOnly} onApply={show} />
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
            show({ ...filters, view: view === "everyone" ? "everyone" : "mine", ownerUserId: undefined });
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
