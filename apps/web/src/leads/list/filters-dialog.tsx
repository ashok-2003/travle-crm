"use client";

// The list's Filters (spec 3.3): stage (Won, Lost and Not a lead live here), owner for managers, source, destination
// and trip type. A sheet on phones; Show leads puts the choice in the address (R41), Clear all empties it. Choosing an
// owner shows everyone's leads, since an owner is a filter on them.
import {
  leadSources,
  leadStages,
  tripTypes,
  type LeadSource,
  type LeadStage,
  type TripType,
} from "@travel-crm/contracts/crm";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { SelectField } from "@/components/forms/select-field";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useLeadOwners } from "../use-lead-owners";
import { DestinationField, type DestinationValue } from "../form/destination-field";
import type { ListFilters } from "./list-filters";

const ANY = "any";

interface FilterValues {
  stage: "open" | LeadStage;
  owner: string;
  source: LeadSource | typeof ANY;
  destination: DestinationValue | null;
  tripType: TripType | typeof ANY;
}

/** How many filters narrow the list beyond its view and search: a closed stage counts, as no chip shows it. */
function chosenCount(filters: ListFilters, chipShown: boolean): number {
  const { ownerUserId, source, destinationId, tripType } = filters;
  return [ownerUserId, source, destinationId, tripType].filter(Boolean).length + (chipShown ? 0 : 1);
}

function FiltersForm({
  formId,
  filters,
  ownOnly,
  onApply,
}: {
  formId: string;
  filters: ListFilters;
  ownOnly: boolean;
  onApply: (filters: ListFilters) => void;
}) {
  const t = useTranslations("leads");
  const words = useTranslations("leads.list.filtersDialog");
  const trpc = useTRPC();
  const owners = useLeadOwners();
  // The list's destination is an id; its name comes from the agency's list, as the picker shows it.
  const destinations = useQuery(
    trpc.destinations.search.queryOptions({ limit: 100 }, { enabled: filters.destinationId !== undefined }),
  );
  const destinationName =
    destinations.data?.find((destination) => destination.id === filters.destinationId)?.name ?? words("chosen");
  const form = useForm<FilterValues>({
    defaultValues: {
      stage: filters.stage,
      owner: filters.ownerUserId ?? ANY,
      source: filters.source ?? ANY,
      destination: filters.destinationId
        ? { kind: "existing", destinationId: filters.destinationId, name: destinationName }
        : null,
      tripType: filters.tripType ?? ANY,
    },
  });
  const { control } = form;
  return (
    <form
      id={formId}
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          const owner = values.owner === ANY ? undefined : values.owner;
          onApply({
            view: owner ? "everyone" : filters.view,
            stage: values.stage,
            ...(owner && { ownerUserId: owner }),
            ...(values.source !== ANY && { source: values.source }),
            ...(values.destination?.kind === "existing" && { destinationId: values.destination.destinationId }),
            ...(values.tripType !== ANY && { tripType: values.tripType }),
            ...(filters.search && { search: filters.search }),
          });
        })(event);
      }}
    >
      <SelectField
        control={control}
        name="stage"
        label={words("stage")}
        options={[
          { value: "open", label: words("openStages") },
          ...leadStages.map((stage) => ({ value: stage, label: t(`stages.${stage}`) })),
        ]}
      />
      {!ownOnly && (
        <SelectField
          control={control}
          name="owner"
          label={words("owner")}
          options={[
            { value: ANY, label: words("anyone") },
            ...(owners.data ?? []).map((worker) => ({ value: worker.userId, label: worker.name })),
          ]}
        />
      )}
      <SelectField
        control={control}
        name="source"
        label={words("source")}
        options={[
          { value: ANY, label: words("anySource") },
          ...leadSources.map((source) => ({ value: source, label: t(`sources.${source}`) })),
        ]}
      />
      <DestinationField control={control} name="destination" label={words("destination")} />
      <SelectField
        control={control}
        name="tripType"
        label={words("tripType")}
        options={[
          { value: ANY, label: words("anyTripType") },
          ...tripTypes.map((kind) => ({ value: kind, label: t(`tripTypes.${kind}`) })),
        ]}
      />
    </form>
  );
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
  const [open, setOpen] = useState(false);
  const formId = useId();
  const chosen = chosenCount(filters, chipShown);
  const apply = (next: ListFilters) => {
    onApply(next);
    setOpen(false);
  };
  return (
    <>
      <Button
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
