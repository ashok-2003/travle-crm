"use client";

// Cancelling a departure (release 7a): a reason is needed. Its holds are released and its waitlist cleared; the bookings on
// it stay, listed on the page, for staff to move or cancel one by one.
import { cancelDepartureInput, type CancelDepartureInput } from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useDepartureChanges } from "./use-departures";

type Problem = "required" | "invalid";

function CancelForm({
  formId,
  departureId,
  changes,
  dialog,
}: {
  formId: string;
  departureId: string;
  changes: ReturnType<typeof useDepartureChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("departures.cancelDialog");
  const values = { reason: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, CancelDepartureInput, Problem>(
    values,
    (typed) =>
      checked(
        cancelDepartureInput.safeParse({ departureId, reason: typed.reason }),
        typed,
        (path) => (String(path[0]) === "reason" ? "reason" : undefined),
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
        changes.cancel.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="reason" label={t("reason")} disabled={changes.cancel.isPending} />
      <FormAlert sending={changes.cancel} problem={formProblem} />
    </form>
  );
}

export function CancelDepartureDialog({ departureId }: { departureId: string }) {
  const t = useTranslations("departures.cancelDialog");
  const dialog = useFormDialog(t("cancelled"));
  const changes = useDepartureChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.cancel}
      trigger={{ label: t("action"), variant: "destructive" }}
      title={t("title")}
      description={t("description")}
      submit={t("action")}
      submitting={t("action")}
      destructive
    >
      {(formId) => <CancelForm formId={formId} departureId={departureId} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
