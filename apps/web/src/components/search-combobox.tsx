"use client";

// A search-as-you-type picker (R45): the registry combobox, a Command in a Popover opened from a field shaped as every
// input, whose options the caller asks the api for as the person types. What the search is doing (a hint before
// typing, searching, nothing found, or a refusal's sentence with Try again) is said in a status outside the listbox, so
// screen readers hear it change. The caller holds the search (useComboboxSearch), asks the api with its query while it
// is open, and gives what came back; it may add one option of its own after the results (a destination's 'Add
// "Spiti"').
import { ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode, type Ref } from "react";
import type { FieldLinks } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupButton } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useErrorMessage } from "@/lib/error-message";

/** The picker's search: open or not, what is typed, and whether it is long enough to ask the api with. */
export interface ComboboxSearch {
  open: boolean;
  setOpen: (open: boolean) => void;
  typed: string;
  setTyped: (typed: string) => void;
  /** What is typed, trimmed, once the typing pauses: what the api is asked with. */
  query: string;
  /** The query is long enough to search with. */
  searching: boolean;
}

/** `shortest`: how many characters the api's search needs (0: it lists without one). */
export function useComboboxSearch(shortest: number): ComboboxSearch {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const query = useDebouncedValue(typed.trim());
  return { open, setOpen, typed, setTyped, query, searching: query.length >= shortest };
}

/** What the api gave for the search (a query's result). */
export interface ComboboxResults<Option> {
  data: Option[] | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

/** An option of the caller's own, offered after the results, whatever the api gave. */
export interface ExtraOption {
  label: ReactNode;
  onSelect: () => void;
}

export function SearchCombobox<Option>({
  links,
  triggerRef,
  search,
  results,
  chosen,
  words,
  optionId,
  renderOption,
  onChoose,
  clearLabel,
  extraOption,
}: {
  links: FieldLinks;
  /** The field's button, for a form that moves the focus to a field with a problem. */
  triggerRef?: Ref<HTMLButtonElement>;
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
  extraOption?: ExtraOption | undefined;
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
      {/* Shaped as every input (the registry InputGroup, as DateField is), so it reads as a field, not a button; the
          trigger is the group's control, so the focus outline goes round the whole field. Its words and chevron are
          coloured as a Select's are, not in the group button's action blue. */}
      <InputGroup>
        <PopoverTrigger asChild>
          <InputGroupButton
            {...links}
            ref={triggerRef}
            data-slot="input-group-control"
            role="combobox"
            aria-expanded={search.open}
            className="h-full flex-1 justify-between rounded-sm px-3 text-left text-base font-normal whitespace-normal"
          >
            <span className={chosen === null ? "text-muted-foreground" : "text-foreground"}>
              {chosen?.name ?? words.none}
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="text-muted-foreground" />
          </InputGroupButton>
        </PopoverTrigger>
      </InputGroup>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false} label={words.search}>
          <CommandInput value={search.typed} onValueChange={search.setTyped} placeholder={words.search} />
          <p role="status" className="px-3 py-2 text-muted-foreground empty:p-0">
            {status}
          </p>
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
              {extraOption && (
                <CommandItem
                  value="extra"
                  onSelect={() => {
                    extraOption.onSelect();
                    search.setOpen(false);
                  }}
                >
                  {extraOption.label}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
        {search.searching && results.isError && (
          // Outside the Command, whose keys take Enter for the highlighted option: here Enter asks again.
          <Button variant="outline" className="mx-3 my-2" onClick={() => void results.refetch()}>
            {tCommon("tryAgain")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
