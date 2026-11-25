"use client";

// Changing the dates of a price-table column that is one range: its first and last day, or "no end date" (it then runs
// with no end). A column of several ranges has no such dialog. Checked by the api's own schema; dates that overlap
// another season are refused, and said on the first day.
import {
  OPEN_SEASON_END,
  savePackageSeasonInput,
  type SavePackageSeasonInput,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { SwitchField } from "./switch-field";
import { usePackageColumnChanges } from "./use-packages";

interface Values {
  startsOn: string;
  endsOn: string;
  noEnd: boolean;
}

function ChangeDatesForm({
  formId,
  packageId,
  column,
  dialog,
}: {
  formId: string;
  packageId: string;
  column: SeasonColumn;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("packages.season");
  const { saveSeasons } = usePackageColumnChanges();
  const range = column.ranges[0];
  const seasonId = column.seasonIds[0];
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SavePackageSeasonInput, "required" | "invalid">(
    {
      startsOn: range?.startsOn ?? "",
      endsOn: range === undefined || range.endsOn === OPEN_SEASON_END ? "" : range.endsOn,
      noEnd: range?.endsOn === OPEN_SEASON_END,
    },
    (typed) =>
      checked(
        savePackageSeasonInput.safeParse({
          packageId,
          seasonId,
          label: column.label,
          startsOn: typed.startsOn,
          endsOn: typed.noEnd ? OPEN_SEASON_END : typed.endsOn,
          prices: column.prices,
        }),
        typed,
        (path) => (path[0] === "startsOn" || path[0] === "endsOn" ? path[0] : undefined),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const noEnd = useWatch({ control: form.control, name: "noEnd" });
  const alert = useRefusalOnField(form, saveSeasons.error, { PACKAGE_SEASON_OVERLAPS: "startsOn" });
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        saveSeasons.mutate([input], { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <DateField control={form.control} name="startsOn" label={t("startsOn")} />
      {!noEnd && <DateField control={form.control} name="endsOn" label={t("endsOn")} />}
      <SwitchField control={form.control} name="noEnd" label={t("noEnd")} id={`${formId}-no-end`} />
      <FormAlert sending={{ error: alert }} problem={formProblem} />
    </form>
  );
}

export function ChangeDatesDialog({
  packageId,
  column,
  held,
  returnFocusTo,
}: {
  packageId: string;
  column: SeasonColumn;
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.season");
  const dialog = useFormDialog(t("datesSaved"), undefined, held);
  const { saveSeasons } = usePackageColumnChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={saveSeasons}
      returnFocusTo={returnFocusTo}
      title={t("datesTitle", { season: column.label })}
      description={t("datesDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <ChangeDatesForm formId={formId} packageId={packageId} column={column} dialog={dialog} />}
    </FormDialog>
  );
}
