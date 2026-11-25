"use client";

// One of the trip's fields (seats on each new departure, the advance) as a line of words with Change, which opens a box in its place.
import type { UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { useChangeGate } from "./departure-edits";
import { LabelledInput } from "./labelled-input";
import { usePackageChanges } from "./use-packages";

export function InlineValue({
  words,
  editLabel,
  boxLabel,
  start,
  parse,
  problem,
  hint,
  save,
  canChange,
}: {
  words: string;
  editLabel: string;
  boxLabel: string;
  start: string;
  parse: (text: string) => Partial<UpdatePackagePartInput> | null;
  problem: string;
  hint?: string | undefined;
  save: (fields: Partial<UpdatePackagePartInput>, done: () => void) => void;
  canChange: boolean;
}) {
  const t = useTranslations("packages.departuresCalendar.repeats");
  const gate = useChangeGate();
  const { updatePart } = usePackageChanges();
  const [typed, setTyped] = useState<string | null>(null);
  if (typed === null) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p>{words}</p>
        {canChange && (
          <Button
            variant="outline"
            aria-label={editLabel}
            disabled={gate.disabled}
            aria-describedby={gate.describedBy}
            onClick={() => {
              setTyped(start);
            }}
          >
            {t("edit")}
          </Button>
        )}
        {gate.hint}
      </div>
    );
  }
  const fields = parse(typed);
  return (
    <div className="flex flex-col gap-3">
      <LabelledInput
        label={boxLabel}
        value={typed}
        onChange={setTyped}
        problem={fields === null ? problem : undefined}
        disabled={updatePart.isPending}
      />
      {hint !== undefined && typed.trim() === "" && <p className="text-caption text-muted-foreground">{hint}</p>}
      <RefusalAlert error={updatePart.error} />
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={fields === null || updatePart.isPending}
          onClick={() => {
            if (fields === null) return;
            save(fields, () => {
              setTyped(null);
            });
          }}
        >
          {t("saveValue")}
        </Button>
        <Button
          variant="outline"
          disabled={updatePart.isPending}
          onClick={() => {
            setTyped(null);
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
