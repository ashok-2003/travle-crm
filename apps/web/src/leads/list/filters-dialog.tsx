"use client";

// The list's Filters (spec 3.3): a button saying how many filters narrow the list, and its dialog (a sheet on phones)
// with the form (filters-form.tsx). Show leads puts the choice in the address (R41), Clear all empties it; closed
// either way, or cancelled, the dialog gives the focus back to Filters.
import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useReturnFocus } from "../lead/use-return-focus";
import { FiltersForm } from "./filters-form";
import type { ListFilters } from "./list-filters";

/** How many filters narrow the list beyond its view and search: a closed stage counts, as no chip shows it. */
function chosenCount(filters: ListFilters, chipShown: boolean): number {
  const { ownerUserId, source, destinationId, tripType } = filters;
  return [ownerUserId, source, destinationId, tripType].filter(Boolean).length + (chipShown ? 0 : 1);
}

export function FiltersDialog({
  filters,
  chipShown,
  ownOnly,
  onApply,
}: {
  filters: ListFilters;
  /** Whether a stage chip shows the list's stage. */
  chipShown: boolean;
  ownOnly: boolean;
  onApply: (filters: ListFilters) => void;
}) {
  const t = useTranslations("leads.list");
  const [open, setOpenState] = useState(false);
  // The dialog isn't opened by its own Radix trigger: closed, it gives the focus back to Filters.
  const { ref: opener, returnFocus } = useReturnFocus();
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) returnFocus();
  };
  const formId = useId();
  const chosen = chosenCount(filters, chipShown);
  const apply = (next: ListFilters) => {
    onApply(next);
    setOpen(false);
  };
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        aria-label={chosen > 0 ? t("filtersChosen", { count: chosen }) : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        <SlidersHorizontalIcon aria-hidden="true" />
        {t("filters")}
        {chosen > 0 && <span className="numbers">{chosen}</span>}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("filtersDialog.title")}
        description={t("filtersDialog.description")}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                apply({ view: filters.view, stage: "open", ...(filters.search && { search: filters.search }) });
              }}
            >
              {t("filtersDialog.clear")}
            </Button>
            <Button type="submit" form={formId}>
              {t("filtersDialog.apply")}
            </Button>
          </>
        }
      >
        {open && <FiltersForm formId={formId} filters={filters} ownOnly={ownOnly} onApply={apply} />}
      </ResponsiveDialog>
    </>
  );
}
