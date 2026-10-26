"use client";

// The list that opens above the reply box while a word is being typed: the quick replies after "/", the teammates after "@".
// The registry's Command lists the rows; the box keeps the focus and moves `active` with the arrow keys, so the list only
// shows which row is chosen and takes a tap. The box is a combobox that names this list by `listId`.
import { type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Command, CommandItem, CommandList } from "@/components/ui/command";

export function ComposerPicker<Choice extends { id: string }>({
  choices,
  active,
  listId,
  label,
  onPick,
  row,
  empty,
}: {
  choices: Choice[];
  /** The index of the chosen row. */
  active: number;
  listId: string;
  label: string;
  onPick: (choice: Choice) => void;
  row: (choice: Choice) => ReactNode;
  /** What stands in the list when there is nothing to choose, if anything should. */
  empty?: string;
}) {
  return (
    <Card size="sm" className="absolute inset-x-0 bottom-full mb-2 py-1">
      {choices.length === 0 ? (
        empty !== undefined && <p className="px-3 py-2 text-muted-foreground">{empty}</p>
      ) : (
        <Command shouldFilter={false} value={choices[active]?.id ?? ""} onValueChange={() => undefined}>
          <CommandList id={listId} aria-label={label}>
            {choices.map((choice) => (
              <CommandItem
                key={choice.id}
                id={`${listId}-${choice.id}`}
                value={choice.id}
                // Keep the focus in the box: the tap still picks.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onSelect={() => {
                  onPick(choice);
                }}
              >
                {row(choice)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      )}
    </Card>
  );
}
