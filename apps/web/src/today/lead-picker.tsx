"use client";

// The lead a task is about (R45, R50): a SearchCombobox over the open leads the member sees, found with leads.list's
// search (a name, forgiving of typos, or 4 or more digits of a phone), ten at a time. Managers search everyone's leads,
// as their scope lets them; salespeople their own. "No lead" unlinks it again.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { FieldLinks } from "@/components/form-field";
import { useTRPC } from "@/data/trpc";
import { useTripLine } from "@/leads/trip-line";
import { useMe, viewScope } from "@/session/me-context";
import { SearchCombobox, useComboboxSearch } from "./search-combobox";

/** A lead as the form keeps it: its id, and its person's name to show. */
export interface PickedLead {
  id: string;
  name: string;
}

const RESULTS = 10;
/** leads.list's search takes at least two characters. */
const SHORTEST_SEARCH = 2;

export function LeadPicker({
  links,
  value,
  onChange,
}: {
  links: FieldLinks;
  value: PickedLead | null;
  onChange: (lead: PickedLead | null) => void;
}) {
  const t = useTranslations("today.addTask");
  const trpc = useTRPC();
  const tripLine = useTripLine();
  const view = viewScope(useMe(), "leads:view") === "all" ? "everyone" : "mine";
  const search = useComboboxSearch(SHORTEST_SEARCH);
  const found = useQuery(
    trpc.leads.list.queryOptions(
      { view, search: search.query, limit: RESULTS },
      { enabled: search.open && search.searching, placeholderData: keepPreviousData, select: (page) => page.items },
    ),
  );
  return (
    <SearchCombobox
      links={links}
      search={search}
      results={found}
      chosen={value}
      words={{
        none: t("noLead"),
        search: t("search"),
        hint: t("searchHint"),
        searching: t("searching"),
        noMatch: t("noMatch"),
      }}
      optionId={(lead) => lead.id}
      renderOption={(lead) => (
        <span className="flex min-w-0 flex-col script-leading">
          {lead.person.name}
          <span className="text-caption text-muted-foreground">{tripLine(lead.trip)}</span>
        </span>
      )}
      onChoose={(lead) => {
        onChange(lead === null ? null : { id: lead.id, name: lead.person.name });
      }}
      clearLabel={t("unlink")}
    />
  );
}
