"use client";

// The destination a merge keeps (spec 3.6): a SearchCombobox over the agency's whole list, alphabetically before
// anything is typed and by part of a name (forgiving of typos) after, so a destination past the first page is found by
// searching. The one being merged is never offered. Assignment rules pick a destination with it too.
import type { Destination } from "@travel-crm/contracts/catalog";
import { useTranslations } from "next-intl";
import type { FieldLinks } from "@/components/form-field";
import { SearchCombobox, useComboboxSearch } from "@/components/search-combobox";
import { useDestinationOptions } from "@/data/use-destination-options";

export function DestinationPicker({
  links,
  value,
  onChange,
  without,
}: {
  links: FieldLinks;
  value: Destination | null;
  onChange: (destination: Destination | null) => void;
  /** The destination never offered: the one being merged. */
  without?: string;
}) {
  const t = useTranslations("settings.destinations.merge");
  // destinations.search lists them all without a query, so every length searches.
  const search = useComboboxSearch(0);
  const found = useDestinationOptions(search, without);
  return (
    <SearchCombobox
      links={links}
      search={search}
      results={found}
      chosen={value}
      words={{ none: t("choose"), search: t("search"), searching: t("searching"), noMatch: t("noMatch") }}
      optionId={(destination) => destination.id}
      renderOption={(destination) => <span className="script-leading">{destination.name}</span>}
      onChoose={onChange}
    />
  );
}
