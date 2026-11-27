"use client";

// New quote from the Quotes list: a quote belongs to a lead, so a centred popup lists the newest leads (or the ones a
// search finds) right under its search box, with a link to make a new lead; once one is chosen it offers that lead's
// own New quote choices: blank, or from a package.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useComboboxSearch } from "@/components/search-combobox";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useLead } from "@/leads/lead/use-lead";
import { useTripLine } from "@/leads/trip-line";
import { routes } from "@/lib/routes";
import { SHORTEST_LEAD_SEARCH, useFoundLeads, type PickedLead } from "@/today/lead-picker";
import { NewQuoteMenu } from "./new-quote-menu";

const NEWEST_LEADS = 8;

export function NewQuoteDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("quotes.list.newQuote");
  const tripLine = useTripLine();
  const [picked, setPicked] = useState<PickedLead | null>(null);
  const [creating, setCreating] = useState(false);
  const search = useComboboxSearch(SHORTEST_LEAD_SEARCH);
  const found = useFoundLeads(search, { limit: NEWEST_LEADS, whenIdle: true });
  const lead = useLead(picked?.id ?? "", { enabled: picked !== null });
  const status = search.searching && found.data === undefined && !found.isError ? t("searching") : null;
  const options = found.data ?? [];
  return (
    <ResponsiveDialog
      centered
      open={open}
      onOpenChange={onOpenChange}
      busy={creating}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
    >
      <div className="flex flex-col gap-4">
        {picked === null ? (
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
                        setPicked({ id: option.id, name: option.person.name });
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
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 font-medium">{picked.name}</span>
              <Button
                variant="outline"
                disabled={creating}
                onClick={() => {
                  setPicked(null);
                }}
              >
                {t("change")}
              </Button>
            </div>
            {lead.data !== undefined && <NewQuoteMenu lead={lead.data} onPending={setCreating} />}
            {lead.isError && (
              <LoadFailedAlert message={t("loadFailed")} error={lead.error} onRetry={() => void lead.refetch()} />
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
