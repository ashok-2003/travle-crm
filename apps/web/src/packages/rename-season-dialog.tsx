"use client";

// Renaming a price-table column: saved through the price table's own save, one transaction, so every season the column is
// made of takes the new name (dates and prices kept) or none does. Other columns are left out of the save.
import {
  savePriceTableInput,
  type RoomType,
  type SavePriceTableInput,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { usePackageChanges } from "./use-packages";

interface Values {
  label: string;
}

function RenameForm({
  formId,
  packageId,
  roomTypes,
  column,
  dialog,
}: {
  formId: string;
  packageId: string;
  roomTypes: readonly RoomType[];
  column: SeasonColumn;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("packages.season");
  const { savePriceTable } = usePackageChanges();
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SavePriceTableInput, "required" | "invalid">(
    { label: column.label },
    (typed) =>
      checked(
        savePriceTableInput.safeParse({
          packageId,
          roomTypes,
          columns: [{ seasonIds: column.seasonIds, label: typed.label, prices: column.prices }],
        }),
        typed,
        (path) => (path[2] === "label" ? "label" : undefined),
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
        savePriceTable.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="label" label={t("label")} hint={t("labelHint")} />
      <FormAlert sending={savePriceTable} problem={formProblem} />
    </form>
  );
}

export function RenameSeasonDialog({
  packageId,
  roomTypes,
  column,
  held,
  returnFocusTo,
}: {
  packageId: string;
  roomTypes: readonly RoomType[];
  column: SeasonColumn;
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.season");
  const dialog = useFormDialog(t("renamed"), undefined, held);
  const { savePriceTable } = usePackageChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={savePriceTable}
      returnFocusTo={returnFocusTo}
      title={t("renameTitle", { season: column.label })}
      description={t("renameDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <RenameForm formId={formId} packageId={packageId} roomTypes={roomTypes} column={column} dialog={dialog} />
      )}
    </FormDialog>
  );
}
