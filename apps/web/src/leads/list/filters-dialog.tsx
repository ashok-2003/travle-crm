"use client";

// The list's Filters (spec 3.3): the shared Filters button and dialog (table-filters.tsx), counting the filters that
// narrow the list (a Show among them), with the form (filters-form.tsx). Show leads puts the choice in the address
// (R41), Clear all empties it; the search box keeps its text either way. Filters' button is the screen's (`opener`), so
// the Show's chip can give it the focus.
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import { TableFilters } from "@/components/data-table/table-filters";
import { FiltersForm } from "./filters-form";
import type { ListFilters } from "./list-filters";

/** How many filters narrow the list beyond its view and search: a closed stage counts, as no chip shows it. */
function chosenCount(filters: ListFilters, chipShown: boolean): number {
  const { ownerUserId, source, destinationId, tripType, created, show } = filters;
  return [ownerUserId, source, destinationId, tripType, created, show].filter(Boolean).length + (chipShown ? 0 : 1);
}

export function FiltersDialog({
  filters,
  chipShown,
  ownOnly,
  opener,
  onApply,
}: {
  filters: ListFilters;
  /** Whether a stage chip shows the list's stage. */
  chipShown: boolean;
  ownOnly: boolean;
  /** The Filters button. */
  opener: RefObject<HTMLButtonElement | null>;
  onApply: (filters: ListFilters) => void;
}) {
  const t = useTranslations("leads.list");
  const chosen = chosenCount(filters, chipShown);
  return (
    <TableFilters
      chosen={chosen}
      opener={opener}
      words={{
        button: t("filters"),
        chosen: t("filtersChosen", { count: chosen }),
        title: t("filtersDialog.title"),
        description: t("filtersDialog.description"),
        clear: t("filtersDialog.clear"),
        apply: t("filtersDialog.apply"),
      }}
      onClear={() => {
        onApply({ view: filters.view, stage: "open" });
      }}
    >
      {(form) => (
        <FiltersForm
          formId={form.id}
          filters={filters}
          ownOnly={ownOnly}
          onApply={(next) => {
            onApply(next);
            form.done();
          }}
        />
      )}
    </TableFilters>
  );
}
