"use client";

// Adding many departure dates to a trip at once: a first and last day and, if wanted, the weekdays (none means every
// day). Afterwards it says how many were added, which days were already there, and offers to reopen a cancelled one.
import {
  addPackageDatesInput,
  type AddPackageDatesInput,
  type AddPackageDatesResult,
} from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, type OpenState } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { useDepartureChanges } from "@/departures/use-departures";
import { formatCalendarDay } from "@/lib/format";
import { Picks, WEEKDAYS } from "./group-fields";

type Problem = "required" | "invalid";
interface Values extends Record<string, unknown> {
  from: string;
  to: string;
  weekdays: string[];
}

const fields = ["from", "to", "weekdays"] as const;

function Outcome({ result, onReopened }: { result: AddPackageDatesResult; onReopened: (departureId: string) => void }) {
  const t = useTranslations("packages.addDates");
  const tCalendar = useTranslations("packages.calendar");
  const { reopen } = useDepartureChanges();
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="font-medium">{t("added", { count: result.added.length })}</p>
      {result.alreadyThere.length > 0 && (
        <p className="text-muted-foreground">
          {t("alreadyThere", { days: result.alreadyThere.map((day) => formatCalendarDay(day)).join(", ") })}
        </p>
      )}
      {result.cancelled.length > 0 && (
        <>
          <p className="text-muted-foreground">{t("cancelledTitle")}</p>
          <ul className="flex flex-col gap-1">
            {result.cancelled.map((entry) => (
              <li key={entry.departureId} className="flex items-center justify-between gap-3">
                <span>{t("cancelledDay", { day: formatCalendarDay(entry.date) })}</span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={reopen.isPending}
                  onClick={() => {
                    reopen.mutate(
                      { departureId: entry.departureId },
                      {
                        onSuccess: () => {
                          toast.success(tCalendar("reopened"));
                          onReopened(entry.departureId);
                        },
                      },
                    );
                  }}
                >
                  {tCalendar("reopen")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {reopen.error !== null && <FormAlert sending={reopen} problem={undefined} />}
    </div>
  );
}

function AddDatesForm({
  formId,
  packageId,
  changes,
  result,
  setResult,
}: {
  formId: string;
  packageId: string;
  changes: ReturnType<typeof useDepartureChanges>;
  result: AddPackageDatesResult | null;
  setResult: (result: AddPackageDatesResult) => void;
}) {
  const t = useTranslations("packages.addDates");
  const tWeekdays = useTranslations("packages.form.weekdays");
  const { form, onSubmit, formProblem } = useCheckedForm<Values, AddPackageDatesInput, Problem>(
    { from: "", to: "", weekdays: [] },
    (typed) =>
      checked(
        addPackageDatesInput.safeParse({
          packageId,
          from: typed.from,
          to: typed.to,
          weekdays: typed.weekdays.map(Number),
        }),
        typed,
        (path) => fields.find((field) => field === String(path[0])),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.addPackageDates.mutate(input, { onSuccess: setResult });
      })}
    >
      <DateField control={form.control} name="from" label={t("from")} />
      <DateField control={form.control} name="to" label={t("to")} />
      <Picks
        control={form.control}
        name="weekdays"
        legend={t("weekdays")}
        hint={t("weekdaysHint")}
        options={WEEKDAYS.map((value) => ({ value, label: tWeekdays(value) }))}
        disabled={changes.addPackageDates.isPending}
      />
      <FormAlert sending={changes.addPackageDates} problem={formProblem} />
      {result !== null && (
        <Outcome
          result={result}
          onReopened={(departureId) => {
            setResult({ ...result, cancelled: result.cancelled.filter((entry) => entry.departureId !== departureId) });
          }}
        />
      )}
    </form>
  );
}

export function AddDatesDialog({
  packageId,
  held,
  returnFocusTo,
}: {
  packageId: string;
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.addDates");
  const changes = useDepartureChanges();
  // What the last try did stays in the dialog, since it says what to do next; a new opening forgets it.
  const [result, setResult] = useState<AddPackageDatesResult | null>(null);
  return (
    <FormDialog
      dialog={{
        open: held.open,
        setOpen: (open) => {
          if (!open) setResult(null);
          held.setOpen(open);
        },
      }}
      sending={changes.addPackageDates}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={t("description")}
      submit={t("add")}
      submitting={t("adding")}
    >
      {(formId) => (
        <AddDatesForm formId={formId} packageId={packageId} changes={changes} result={result} setResult={setResult} />
      )}
    </FormDialog>
  );
}
