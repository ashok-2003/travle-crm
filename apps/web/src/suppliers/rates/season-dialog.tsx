"use client";

// A season of a supplier's rates (release 7b): a name and the first and last day it holds.
import { saveSeasonInput, type RateSeason, type SaveSeasonInput } from "@travel-crm/contracts/suppliers";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { DateField } from "@/components/date-field";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRateChanges } from "./use-rates";

type Problem = "required" | "invalid" | "order";
interface Values {
  label: string;
  startsOn: string;
  endsOn: string;
}

function SeasonForm({
  formId,
  supplierId,
  season,
  changes,
  dialog,
}: {
  formId: string;
  supplierId: string;
  season: RateSeason | null;
  changes: ReturnType<typeof useRateChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("suppliers.rates.season");
  const values: Values = { label: season?.label ?? "", startsOn: season?.startsOn ?? "", endsOn: season?.endsOn ?? "" };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SaveSeasonInput, Problem>(
    values,
    (typed) =>
      checked(
        saveSeasonInput.safeParse({ supplierId, ...(season === null ? {} : { seasonId: season.id }), ...typed }),
        typed,
        (path) => (Object.keys(values) as (keyof Values)[]).find((field) => field === String(path[0])),
        (field) => (field === "endsOn" ? "order" : "invalid"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  const busy = changes.saveSeason.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.saveSeason.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="label" label={t("label")} hint={t("labelHint")} disabled={busy} />
      <DateField control={form.control} name="startsOn" label={t("startsOn")} />
      <DateField control={form.control} name="endsOn" label={t("endsOn")} />
      <FormAlert sending={changes.saveSeason} problem={formProblem} />
    </form>
  );
}

export function SeasonDialog({ supplierId, season }: { supplierId: string; season: RateSeason | null }) {
  const t = useTranslations("suppliers.rates");
  const dialog = useFormDialog(t("season.saved"));
  const changes = useRateChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.saveSeason}
      trigger={
        season === null
          ? { label: t("addSeason"), variant: "outline" }
          : {
              label: t("editSeason"),
              accessibleLabel: t("editSeasonNamed", { name: season.label }),
              variant: "outline",
            }
      }
      title={season === null ? t("season.addTitle") : t("season.editTitle")}
      description={t("season.description")}
      submit={t("season.save")}
      submitting={t("season.saving")}
    >
      {(formId) => (
        <SeasonForm formId={formId} supplierId={supplierId} season={season} changes={changes} dialog={dialog} />
      )}
    </FormDialog>
  );
}
