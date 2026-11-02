"use client";

// Copy a season to other dates, usually next year, with every cost changed by a share (release 7b): plain code, the same
// rates and the new costs rounded to a whole rupee.
import { copySeasonInput, type CopySeasonInput, type RateSeason } from "@travel-crm/contracts/suppliers";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { basisPointsOf } from "@/lib/percent";
import { useRateChanges } from "./use-rates";

type Problem = "required" | "invalid" | "order" | "change";
interface Values {
  label: string;
  startsOn: string;
  endsOn: string;
  /** A percentage as typed: "5", "-2.5". */
  change: string;
}

/** The same day a year on (a 29 February becomes 1 March). */
export function yearLater(day: string): string {
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year + 1, month - 1, date)).toISOString().slice(0, 10);
}

/** A name with its years moved on: "Peak 2026" becomes "Peak 2027". */
export const nextYearLabel = (label: string) =>
  label.replace(/\b(20\d{2})\b/g, (year) => String(Number(year) + 1)).slice(0, 80);

function CopyForm({
  formId,
  season,
  changes,
  dialog,
}: {
  formId: string;
  season: RateSeason;
  changes: ReturnType<typeof useRateChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("suppliers.rates.copy");
  const values: Values = {
    label:
      nextYearLabel(season.label) === season.label
        ? `${season.label} (copy)`.slice(0, 80)
        : nextYearLabel(season.label),
    startsOn: yearLater(season.startsOn),
    endsOn: yearLater(season.endsOn),
    change: "0",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CopySeasonInput, Problem>(
    values,
    (typed) => {
      const change = basisPointsOf(typed.change);
      return checked(
        copySeasonInput.safeParse({
          seasonId: season.id,
          label: typed.label,
          startsOn: typed.startsOn,
          endsOn: typed.endsOn,
          changeBasisPoints: change ?? Number.NaN,
        }),
        typed,
        (path) =>
          path[0] === "changeBasisPoints"
            ? "change"
            : (Object.keys(values) as (keyof Values)[]).find((field) => field === String(path[0])),
        (field) => (field === "endsOn" ? "order" : field === "change" ? "change" : "invalid"),
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  const busy = changes.copySeason.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.copySeason.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="label" label={t("label")} disabled={busy} />
      <DateField control={form.control} name="startsOn" label={t("startsOn")} />
      <DateField control={form.control} name="endsOn" label={t("endsOn")} />
      <TextField
        control={form.control}
        name="change"
        label={t("change")}
        hint={t("changeHint")}
        inputMode="decimal"
        className="numbers"
        disabled={busy}
      />
      <FormAlert sending={changes.copySeason} problem={formProblem} />
    </form>
  );
}

export function CopySeasonDialog({ season }: { season: RateSeason }) {
  const t = useTranslations("suppliers.rates");
  const dialog = useFormDialog(t("copy.saved"));
  const changes = useRateChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.copySeason}
      trigger={{
        label: t("copySeason"),
        accessibleLabel: t("copySeasonNamed", { name: season.label }),
        variant: "outline",
      }}
      title={t("copy.title")}
      description={t("copy.description")}
      submit={t("copy.save")}
      submitting={t("copy.saving")}
    >
      {(formId) => <CopyForm formId={formId} season={season} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
