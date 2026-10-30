"use client";

// What the AI filled into a form, until the person says otherwise: which paths it applied, from which words, and the form as
// it was before (for "Undo AI fill"). A field stays marked in violet while it still holds the value the AI gave and goes back to
// normal as soon as the person edits it. Nothing is sent to the server by Apply: the form's own save does that, carrying the
// fill's id and the applied paths (`use()`) so the save is audited as drafted by AI.
import type { AiFillField, AiFillProposal, FillPath } from "@travel-crm/contracts/ai";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { sameValue, type FillConverter } from "./fill-converters";

interface Applied<Values> {
  fillId: string;
  fields: Partial<Record<FillPath, AiFillField>>;
  before: Values;
}

export interface FillMarks {
  /** The applied field if the form still holds the AI's value for this path. */
  markOf(path: FillPath): AiFillField | null;
  /** Whether an Apply is in effect (Undo is offered). */
  active: boolean;
  /** What the form holds now, at the fill's paths. */
  current(): Partial<Record<FillPath, unknown>>;
  /** Copies the ticked fields into the form (unsaved) and remembers how it was. */
  apply(proposal: AiFillProposal, ticked: readonly FillPath[]): void;
  undo(): void;
  /** For the save's input: the fill and the paths applied, or nothing when no fill is in effect. */
  use(): { fillId: string; paths: string[] } | undefined;
}

const MarksContext = createContext<FillMarks | null>(null);

export function FillMarksProvider({ marks, children }: { marks: FillMarks; children: ReactNode }) {
  return <MarksContext value={marks}>{children}</MarksContext>;
}

export const useMarks = (): FillMarks | null => useContext(MarksContext);

export function useFillMarks<Values extends FieldValues>(
  form: UseFormReturn<Values>,
  converter: FillConverter<Values>,
): FillMarks {
  // Watching all values re-renders the form on every change, which is what lets a mark go when its field is edited.
  const values: Values = form.watch();
  const [applied, setApplied] = useState<Applied<Values> | null>(null);
  const current = () => converter.read(values);
  return {
    active: applied !== null,
    current,
    markOf(path) {
      const field = applied?.fields[path];
      return field !== undefined && sameValue(path, current()[path], field.value) ? field : null;
    },
    apply(proposal, ticked) {
      const before: Values = structuredClone(form.getValues());
      const fields: Applied<Values>["fields"] = {};
      for (const field of proposal.fields) {
        if (!ticked.includes(field.path)) continue;
        fields[field.path] = field;
        for (const [key, value] of Object.entries(converter.patch(field.path, field.value))) {
          form.setValue(key as never, value as never, { shouldDirty: true });
        }
      }
      setApplied({ fillId: proposal.fillId, fields, before });
    },
    undo() {
      if (applied === null) return;
      form.reset(applied.before);
      setApplied(null);
    },
    use() {
      return applied === null ? undefined : { fillId: applied.fillId, paths: Object.keys(applied.fields) };
    },
  };
}
