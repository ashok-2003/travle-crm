"use client";

// A search-as-you-type picker (R45): the registry combobox, a Command in a Popover, whose options the caller asks the
// api for as the person types. What the search is doing (a hint before typing, searching, nothing found, or a
// refusal's sentence with Try again) is said in a status outside the listbox, so screen readers hear it change. The
// caller holds the search (useComboboxSearch), asks the api with its query while it is open, and gives what came back.
import { ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import type { FieldLinks } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useErrorMessage } from "@/lib/error-message";

/** The picker's search: open or not, what is typed, and whether it is long enough to ask the api with. */
export interface ComboboxSearch {
  open: boolean;
  setOpen: (open: boolean) => void;
  typed: string;
  setTyped: (typed: string) => void;
  /** What is typed, trimmed. */
  query: string;
  /** The query is long enough to search with. */
  searching: boolean;
}

/** `shortest`: how many characters the api's search needs (0: it lists without one). */
export function useComboboxSearch(shortest: number): ComboboxSearch {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const query = typed.trim();
  return { open, setOpen, typed, setTyped, query, searching: query.length >= shortest };
}

/** What the api gave for the search (a query's result). */
export interface ComboboxResults<Option> {
  data: Option[] | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

export function SearchCombobox<Option>({
  links,
  search,
  results,
  chosen,
  words,
  optionId,
  renderOption,
  onChoose,
  clearLabel,
}: {
  links: FieldLinks;
  search: ComboboxSearch;
  results: ComboboxResults<Option>;
  /** What is chosen: its id, and its name for the button; null for nothing yet. */
  chosen: { id: string; name: string } | null;
  /** The button's words while nothing is chosen, the search box's name, and the status's words. */
  words: { none: string; search: string; searching: string; noMatch: string; hint?: string };
  optionId: (option: Option) => string;
  renderOption: (option: Option) => ReactNode;
  onChoose: (option: Option | null) => void;
  /** An option to choose nothing again, offered while something is chosen. */
  clearLabel?: string;
}) {
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const options = search.searching ? (results.data ?? []) : [];
  const status = !search.searching
    ? (words.hint ?? null)
    : results.isError
      ? apiError(results.error)
      : results.data === undefined
        ? words.searching
        : options.length === 0
          ? words.noMatch
          : null;
  const choose = (option: Option | null) => {
    onChoose(option);
    search.setOpen(false);
  };
  return (
    <Popover open={search.open} onOpenChange={search.setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...links}
          variant="outline"
          role="combobox"
          aria-expanded={search.open}
          className="h-auto min-h-11 w-full justify-between text-left font-normal whitespace-normal"
        >
          {chosen?.name ?? words.none}
          <ChevronsUpDownIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false} label={words.search}>
          <CommandInput value={search.typed} onValueChange={search.setTyped} placeholder={words.search} />
          <p role="status" className="px-3 py-2 text-muted-foreground empty:p-0">
            {status}
          </p>
          {search.searching && results.isError && (
            <Button variant="outline" className="mx-3 mb-2 self-start" onClick={() => void results.refetch()}>
              {tCommon("tryAgain")}
            </Button>
          )}
          <CommandList>
            <CommandGroup>
              {clearLabel !== undefined && chosen !== null && (
                <CommandItem
                  value="none"
                  onSelect={() => {
                    choose(null);
                  }}
                >
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={optionId(option)}
                  value={optionId(option)}
                  data-checked={optionId(option) === chosen?.id}
                  onSelect={() => {
                    choose(option);
                  }}
                >
                  {renderOption(option)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
