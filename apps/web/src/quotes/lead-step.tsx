"use client";

// The first step of a popup that works on a lead (New quote, New booking): the newest leads right under a search box (or
// the ones a search finds), with a link to make a new lead.
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { useComboboxSearch } from "@/components/search-combobox";
import { TextLink } from "@/components/text-link";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useTripLine } from "@/leads/trip-line";
import { routes } from "@/lib/routes";
import { SHORTEST_LEAD_SEARCH, useFoundLeads, type PickedLead } from "@/today/lead-picker";

const NEWEST_LEADS = 8;

export function LeadStep({ onPick }: { onPick: (lead: PickedLead) => void }) {
  const t = useTranslations("quotes.list.newQuote");
  const tripLine = useTripLine();
  const search = useComboboxSearch(SHORTEST_LEAD_SEARCH);
  const found = useFoundLeads(search, { limit: NEWEST_LEADS, whenIdle: true });
  const status = search.searching && found.data === undefined && !found.isError ? t("searching") : null;
  const options = found.data ?? [];
  return (
    <>
      <Command shouldFilter={false} label={t("search")} className="p-0">
        <CommandInput value={search.typed} onValueChange={search.setTyped} placeholder={t("search")} />
        <p role="status" className="px-3 py-2 text-muted-foreground empty:p-0">
          {status ??
            (found.isError ? null : !search.searching ? t("hint") : options.length === 0 ? t("noMatch") : null)}
        </p>
        <CommandList>
          <CommandGroup>
            {options.map((option) => (
              <CommandItem
                key={option.id}
                value={option.id}
                onSelect={() => {
                  onPick({ id: option.id, name: option.person.name });
                }}
              >
                <span className="flex min-w-0 flex-col script-leading">
                  {option.person.name}
                  <span className="text-caption text-muted-foreground">{tripLine(option.trip)}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {found.isError && (
        <LoadFailedAlert message={t("listFailed")} error={found.error} onRetry={() => void found.refetch()} />
      )}
      <TextLink href={routes.newLead}>{t("newLead")}</TextLink>
    </>
  );
}
