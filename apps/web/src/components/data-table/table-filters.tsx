"use client";

// A list's Filters (spec 3.3; the Leads list's first, now every table's): a button saying how many filters narrow the
// list, and its dialog (a sheet on phones) holding the list's own form, mounted only while open so each opening starts
// from the list's filters. The footer's Apply submits that form; Clear all lets every filter go; either closes the
// dialog. Closed, or cancelled, the dialog gives the focus back to the button, which the screen holds (`opener`), so a
// chip that lets a filter go can give it the focus too.
import { SlidersHorizontalIcon } from "lucide-react";
import { useId, useState, type ReactNode, type RefObject } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";

/** The list's own words: the button, its name with the count ("Filters, 2 chosen"), the dialog's and its buttons'. */
export interface TableFiltersWords {
  button: string;
  chosen: string;
  title: string;
  description: string;
  clear: string;
  apply: string;
}

export function TableFilters({
  chosen,
  opener,
  words,
  onClear,
  children,
}: {
  /** How many filters narrow the list. */
  chosen: number;
  /** The Filters button. */
  opener: RefObject<HTMLButtonElement | null>;
  words: TableFiltersWords;
  /** Lets every filter go. */
  onClear: () => void;
  /** The form, given its id (the footer's Apply submits it) and `done`, which closes the dialog once it applied. */
  children: (form: { id: string; done: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const done = () => {
    setOpen(false);
  };
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        aria-label={chosen > 0 ? words.chosen : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        <SlidersHorizontalIcon aria-hidden="true" />
        {words.button}
        {chosen > 0 && <span className="numbers">{chosen}</span>}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={opener}
        title={words.title}
        description={words.description}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                onClear();
                done();
              }}
            >
              {words.clear}
            </Button>
            <Button type="submit" form={formId}>
              {words.apply}
            </Button>
          </>
        }
      >
        {open && children({ id: formId, done })}
      </ResponsiveDialog>
    </>
  );
}
