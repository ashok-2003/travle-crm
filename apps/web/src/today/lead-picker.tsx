"use client";

// The lead a task is about (R45, R50): the registry combobox, a Command in a Popover, searching the open leads the
// member sees with leads.list's search (a name, forgiving of typos, or 4 or more digits of a phone), ten at a time.
// Managers search everyone's leads, as their scope lets them; salespeople their own. "No lead" unlinks it again.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { FieldLinks } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTRPC } from "@/data/trpc";
import { useTripLine } from "@/leads/trip-line";
import { useErrorMessage } from "@/lib/error-message";
import { useMe, viewScope } from "@/session/me-context";

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
  const { apiError } = useErrorMessage();
  const view = viewScope(useMe(), "leads:view") === "all" ? "everyone" : "mine";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim();
  const searching = query.length >= SHORTEST_SEARCH;
  const found = useQuery(
    trpc.leads.list.queryOptions(
      { view, search: query, limit: RESULTS },
      { enabled: open && searching, placeholderData: keepPreviousData },
    ),
  );
  const leads = searching ? (found.data?.items ?? []) : [];
  const status = !searching
    ? t("searchHint")
    : found.isError
      ? apiError(found.error)
      : found.data === undefined
        ? t("searching")
        : leads.length === 0
          ? t("noMatch")
          : null;
  const choose = (lead: PickedLead | null) => {
    onChange(lead);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...links}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-11 w-full justify-between text-left font-normal whitespace-normal"
        >
          {value?.name ?? t("noLead")}
          <ChevronsUpDownIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false} label={t("search")}>
          <CommandInput value={search} onValueChange={setSearch} placeholder={t("search")} />
          <CommandList>
            {status !== null && <p className="px-3 py-2 text-muted-foreground">{status}</p>}
            <CommandGroup>
              {value !== null && (
                <CommandItem
                  value="no-lead"
                  onSelect={() => {
                    choose(null);
                  }}
                >
                  {t("unlink")}
                </CommandItem>
              )}
              {leads.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={lead.id}
                  data-checked={value?.id === lead.id}
                  onSelect={() => {
                    choose({ id: lead.id, name: lead.person.name });
                  }}
                >
                  <span className="flex min-w-0 flex-col script-leading">
                    {lead.person.name}
                    <span className="text-caption text-muted-foreground">{tripLine(lead.trip)}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
