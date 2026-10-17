"use client";

// Leads (spec 3.3): everyone who asked about a trip, newest first, a page at a time. Mine · open by default; managers
// (leads:view on everyone's) switch Mine and Everyone with Tabs and filter by owner; everyone searches by name or
// phone, picks a stage chip, or opens Filters. The filters live in the address (R41), and each row's link carries them
// for the way back. A phone gets a divided list, a computer the Table (R44); loading shows skeleton rows, a failure
// says so with Try again (a refusal its reason), and an empty list says what belongs here or that nothing matches.
import { ContactIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { FiltersDialog } from "./filters-dialog";
import { LeadRows } from "./lead-rows";
import { LeadsTable } from "./leads-table";
import { isFiltered, listFiltersHref, listFiltersOf, type FiltersToShow } from "./list-filters";
import { NewLeadButton } from "./new-lead-button";
import { SearchField } from "./search-field";
import { isChipStage, StageChips } from "./stage-chips";
import { useLeadCounts, useLeads } from "./use-leads";

export function LeadsScreen() {
  const t = useTranslations("leads.list");
  const tCommon = useTranslations("common");
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const router = useRouter();
  const input = listFiltersOf(useSearchParams(), ownOnly ? "own" : "all");
  const leads = useLeads(input);
  const counts = useLeadCounts(input);
  const wide = useWideScreen();
  const newLead = useHolds("leads:create") && <NewLeadButton />;
  // Clear filters empties the search box too, by giving it a fresh start.
  const [searchBox, setSearchBox] = useState(0);

  const show = (filters: FiltersToShow) => {
    router.replace(listFiltersHref(filters));
  };
  // The search keeps every other filter as the address has it when the typing pauses.
  const onSearch = (search: string) => {
    show({ ...input, search });
  };
  const clear = () => {
    show({ view: input.view });
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
      return <LoadingRows shape={wide ? "table" : "twoLines"} columns={7} label={t("loading")} />;
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
        {wide ? (
          <LeadsTable leads={leads.items} people={leads.people} filters={input} showOwner={!ownOnly} />
        ) : (
          <LeadRows leads={leads.items} filters={input} />
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
      <SearchField key={searchBox} initial={input.search ?? ""} onSearch={onSearch} />
      {/* The chips scroll sideways on a phone (R42); the padding keeps their focus outline in view. */}
      <div className="-m-1 flex items-center gap-2 overflow-x-auto p-1 md:flex-wrap md:overflow-visible">
        <StageChips
          stage={input.stage}
          counts={counts.data}
          ownOnly={ownOnly}
          onChoose={(stage) => {
            show({ ...input, stage });
          }}
        />
        <FiltersDialog filters={input} chipShown={isChipStage(input.stage)} ownOnly={ownOnly} onApply={show} />
      </div>
      {counts.isError && (
        // The chips still filter without their counts; a line says they didn't load, with Try again. A refusal would
        // refuse the list too, whose own error says its reason.
        <Alert>
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {t("countsFailed")}
            <Button variant="outline" onClick={() => void counts.refetch()}>
              {tCommon("tryAgain")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} action={newLead} />
      {ownOnly ? (
        <div className="flex flex-col gap-6">
          {toolbar}
          {body()}
        </div>
      ) : (
        <Tabs
          value={input.view}
          onValueChange={(view) => {
            show({ ...input, view: view === "everyone" ? "everyone" : "mine", ownerUserId: undefined });
          }}
          className="gap-6"
        >
          {toolbar}
          <TabsContent value={input.view} className="text-base">
            {body()}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
