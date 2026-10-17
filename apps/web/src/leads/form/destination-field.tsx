"use client";

// The destination picker (spec 3.2, R45): the registry combobox, a Command in a Popover, searching the agency's own
// list as the person types (destinations.search, forgiving of typos). In the lead form a name that isn't on the list
// can be added ('Add "Spiti"'), which the api adds to the list when the lead is saved; the list's filter picks only
// existing ones. A search that fails says so, with Try again. Labelled, hinted and with its error as every field is
// (form-field.tsx).
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useController, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTRPC } from "@/data/trpc";
import { useDebouncedValue } from "./use-debounced-value";

/** A destination on the agency's list, or a new name for it. */
export type DestinationValue =
  { kind: "existing"; destinationId: string; name: string } | { kind: "new"; name: string };

const SEARCH_PAUSE_MS = 250;

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
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const { field, fieldState } = useController({ control, name });
  const value: unknown = field.value;
  const chosen = isDestinationValue(value) ? value : null;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const query = useDebouncedValue(tidy(typed), SEARCH_PAUSE_MS);
  const found = useQuery(
    trpc.destinations.search.queryOptions(
      { ...(query !== "" && { query }), limit: 20 },
      // The last answer stays while the next one loads, so the list doesn't blink at each pause.
      { enabled: open, placeholderData: (previous) => previous },
    ),
  );
  const newName = tidy(typed);
  const listed = found.data?.some((destination) => destination.name.toLowerCase() === newName.toLowerCase());
  const choose = (next: DestinationValue | null) => {
    field.onChange(next);
    setOpen(false);
    setTyped("");
  };
  return (
    <FormField label={label} hint={hint} error={fieldState.error?.message}>
      {(links) => (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) field.onBlur();
          }}
        >
          <PopoverTrigger asChild>
            <Button
              {...links}
              ref={field.ref}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              // Shaped and sized as the form's other fields (6px, 16px text), not as a pill button.
              className="h-auto min-h-11 w-full justify-between rounded-sm text-left text-base font-normal whitespace-normal"
            >
              {chosen ? chosen.name : <span className="text-muted-foreground">{t("placeholder")}</span>}
              <ChevronsUpDownIcon aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
            <Command shouldFilter={false} label={label}>
              <CommandInput
                value={typed}
                onValueChange={setTyped}
                placeholder={allowNew ? t("searchOrAdd") : t("search")}
              />
              <CommandList>
                {!found.isError && <CommandEmpty>{found.isPending ? t("searching") : t("noMatch")}</CommandEmpty>}
                <CommandGroup>
                  {found.data?.map((destination) => (
                    <CommandItem
                      key={destination.id}
                      value={destination.id}
                      data-checked={chosen?.kind === "existing" && chosen.destinationId === destination.id}
                      onSelect={() => {
                        choose({ kind: "existing", destinationId: destination.id, name: destination.name });
                      }}
                    >
                      {destination.name}
                    </CommandItem>
                  ))}
                  {allowNew && newName !== "" && listed !== true && (
                    <CommandItem
                      value="new"
                      onSelect={() => {
                        choose({ kind: "new", name: newName });
                      }}
                    >
                      <PlusIcon aria-hidden="true" />
                      {t("add", { name: newName })}
                    </CommandItem>
                  )}
                  {chosen && (
                    <CommandItem
                      value="none"
                      onSelect={() => {
                        choose(null);
                      }}
                    >
                      {t("clear")}
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
            {found.isError && (
              // Not "no match": the list didn't load; a new name can still be added meanwhile. Outside the Command,
              // whose keys would take Enter on Try again for the highlighted option, and outside its listbox.
              <ErrorState
                message={t("loadFailed")}
                error={found.error}
                retryLabel={tCommon("tryAgain")}
                onRetry={() => void found.refetch()}
              />
            )}
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}
