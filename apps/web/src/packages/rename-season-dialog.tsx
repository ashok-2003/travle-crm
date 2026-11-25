"use client";

// Renaming a price-table column: every season it is made of takes the new name, keeping its dates and prices.
import { savePackageSeasonInput, type SavePackageSeasonInput, type SeasonColumn } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { usePackageColumnChanges } from "./use-packages";

interface Values {
  label: string;
}

function RenameForm({
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
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SavePackageSeasonInput[], "required" | "invalid">(
    { label: column.label },
    (typed) =>
      checked(
        z.array(savePackageSeasonInput).safeParse(
          column.seasonIds.map((seasonId, index) => ({
            packageId,
            seasonId,
            label: typed.label,
            startsOn: column.ranges[index]?.startsOn,
            endsOn: column.ranges[index]?.endsOn,
            prices: column.prices,
          })),
        ),
        typed,
        () => "label",
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((inputs) => {
        saveSeasons.mutate(inputs, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="label" label={t("label")} hint={t("labelHint")} />
      <FormAlert sending={saveSeasons} problem={formProblem} />
    </form>
  );
}

export function RenameSeasonDialog({
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
  const dialog = useFormDialog(t("renamed"), undefined, held);
  const { saveSeasons } = usePackageColumnChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={saveSeasons}
      returnFocusTo={returnFocusTo}
      title={t("renameTitle", { season: column.label })}
      description={t("renameDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <RenameForm formId={formId} packageId={packageId} column={column} dialog={dialog} />}
    </FormDialog>
  );
}
