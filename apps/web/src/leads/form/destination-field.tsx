"use client";

// The destination picker (spec 3.2, R45): the shared SearchCombobox over the agency's own list, searched as the person
// types (destinations.search, forgiving of typos), with "No destination" once one is chosen. In the lead form a name
// that isn't on the list can be added ('Add "Spiti"'), which the api adds to the list when the lead is saved; the
// list's filter picks only existing ones. Labelled, hinted and with its error as every field is (form-field.tsx).
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useController, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { SearchCombobox, useComboboxSearch } from "@/components/search-combobox";
import { useTRPC } from "@/data/trpc";

/** A destination on the agency's list, or a new name for it. */
export type DestinationValue =
  { kind: "existing"; destinationId: string; name: string } | { kind: "new"; name: string };

const RESULTS = 20;

function isDestinationValue(value: unknown): value is DestinationValue {
  return typeof value === "object" && value !== null && "kind" in value && "name" in value;
}

/** A name as the api keeps it: trimmed, inner spaces collapsed. */
const tidy = (name: string) => name.trim().replace(/\s+/g, " ");

export function DestinationField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
  allowNew = false,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string;
  /** Whether a name not on the list may be chosen, to be added with the lead. */
  allowNew?: boolean;
}) {
  const t = useTranslations("leads.form.destination");
  const trpc = useTRPC();
  const { field, fieldState } = useController({ control, name });
  const value: unknown = field.value;
  const chosen = isDestinationValue(value) ? value : null;
  // destinations.search lists them all without a query, so every length searches.
  const search = useComboboxSearch(0);
  const found = useQuery(
    trpc.destinations.search.queryOptions(
      { ...(search.query !== "" && { query: search.query }), limit: RESULTS },
      { enabled: search.open, placeholderData: keepPreviousData },
    ),
  );
  const newName = tidy(search.typed);
  const listed = found.data?.some((destination) => destination.name.toLowerCase() === newName.toLowerCase());
  const choose = (next: DestinationValue | null) => {
    field.onChange(next);
    search.setTyped("");
  };
  return (
    <FormField label={label} hint={hint} error={fieldState.error?.message}>
      {(links) => (
        <SearchCombobox
          links={links}
          triggerRef={field.ref}
          search={{
            ...search,
            setOpen: (open) => {
              search.setOpen(open);
              if (!open) field.onBlur();
            },
          }}
          results={found}
          chosen={
            chosen === null
              ? null
              : { id: chosen.kind === "existing" ? chosen.destinationId : "new", name: chosen.name }
          }
          words={{
            none: t("placeholder"),
            search: allowNew ? t("searchOrAdd") : t("search"),
            searching: t("searching"),
            noMatch: t("noMatch"),
          }}
          optionId={(destination) => destination.id}
          renderOption={(destination) => <span className="script-leading">{destination.name}</span>}
          onChoose={(destination) => {
            choose(destination && { kind: "existing", destinationId: destination.id, name: destination.name });
          }}
          clearLabel={t("clear")}
          extraOption={
            allowNew && newName !== "" && listed !== true
              ? {
                  label: (
                    <>
                      <PlusIcon aria-hidden="true" />
                      {t("add", { name: newName })}
                    </>
                  ),
                  onSelect: () => {
                    choose({ kind: "new", name: newName });
                  },
                }
              : undefined
          }
        />
      )}
    </FormField>
  );
}
