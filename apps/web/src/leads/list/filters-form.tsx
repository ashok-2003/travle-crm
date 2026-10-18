"use client";

// The Filters dialog's form (spec 3.3): stage (Won, Lost and Not a lead live here; each stage with its dot), owner for
// managers, source, destination and trip type, started from the list's filters. Choosing an owner shows everyone's
// leads, since an owner is a filter on them; the list's search, which isn't one of these, stays as it is. Owners that
// didn't load say so with Try again, and Anyone still filters.
import {
  leadSources,
  leadStages,
  tripTypes,
  type LeadSource,
  type LeadStage,
  type TripType,
} from "@travel-crm/contracts/crm";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { SelectField } from "@/components/forms/select-field";
import { useTRPC } from "@/data/trpc";
import { DestinationField, type DestinationValue } from "../form/destination-field";
import { OwnersFailed } from "../owners-failed";
import { StageDot } from "../stage-badge";
import { useLeadOwners } from "../use-lead-owners";
import type { ListFilters } from "./list-filters";

const ANY = "any";

interface FilterValues {
  stage: "open" | LeadStage;
  owner: string;
  source: LeadSource | typeof ANY;
  destination: DestinationValue | null;
  tripType: TripType | typeof ANY;
}

export function FiltersForm({
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
  const named = destinations.data?.find((destination) => destination.id === filters.destinationId);
  const destinationName = named?.name ?? words("chosen");
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
  // Opened before the agency's list arrived, the picker names the chosen destination once it does.
  useEffect(() => {
    const chosen = form.getValues("destination");
    if (named && chosen?.kind === "existing" && chosen.destinationId === named.id && chosen.name !== named.name) {
      form.setValue("destination", { ...chosen, name: named.name });
    }
  }, [named, form]);
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
          ...leadStages.map((stage) => ({
            value: stage,
            label: (
              <span className="inline-flex items-center gap-2">
                <StageDot stage={stage} />
                {t(`stages.${stage}`)}
              </span>
            ),
          })),
        ]}
      />
      {!ownOnly && (
        <>
          <SelectField
            control={control}
            name="owner"
            label={words("owner")}
            options={[
              { value: ANY, label: words("anyone") },
              ...(owners.data ?? []).map((worker) => ({ value: worker.userId, label: worker.name })),
            ]}
          />
          <OwnersFailed owners={owners} />
        </>
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
