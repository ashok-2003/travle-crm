"use client";

// Putting a lead on a departure's waitlist (release 7a): the lead and how many seats. When seats free up, the owner of the
// first lead whose party fits is told.
import { addWaitlistInput, type AddWaitlistInput, type DepartureDetail } from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LeadPicker, type PickedLead } from "@/today/lead-picker";
import { useDepartureChanges } from "./use-departures";

type Problem = "required" | "invalid";
interface Values {
  lead: PickedLead | null;
  seats: string;
}

function WaitlistForm({
  formId,
  departure,
  changes,
  dialog,
}: {
  formId: string;
  departure: DepartureDetail;
  changes: ReturnType<typeof useDepartureChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("departures.seats.waitlist");
  const tForm = useTranslations("departures.seats.holdDialog");
  const values: Values = { lead: null, seats: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, AddWaitlistInput, Problem>(
    values,
    (typed) =>
      checked(
        addWaitlistInput.safeParse({
          departureId: departure.id,
          leadId: typed.lead?.id ?? "",
          seats: /^\d+$/.test(typed.seats.trim()) ? Number(typed.seats) : -1,
        }),
        typed,
        (path) => {
          const key = String(path[0]);
          return key === "leadId" ? "lead" : key === "seats" ? "seats" : undefined;
        },
        () => "invalid",
      ),
    (problem) => tForm(`problems.${problem}`),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.addToWaitlist.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <Controller
        control={form.control}
        name="lead"
        render={({ field, fieldState }) => (
          <FormField label={t("lead")} hint={tForm("leadHint")} error={fieldState.error?.message}>
            {(links) => <LeadPicker links={links} value={field.value} onChange={field.onChange} />}
          </FormField>
        )}
      />
      <TextField
        control={form.control}
        name="seats"
        label={t("seats")}
        inputMode="numeric"
        disabled={changes.addToWaitlist.isPending}
      />
      <FormAlert sending={changes.addToWaitlist} problem={formProblem} />
    </form>
  );
}

export function WaitlistDialog({ departure }: { departure: DepartureDetail }) {
  const t = useTranslations("departures.seats.waitlist");
  const dialog = useFormDialog(t("added"));
  const changes = useDepartureChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.addToWaitlist}
      trigger={{ label: t("add"), variant: "outline" }}
      title={t("addTitle")}
      description={t("addDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <WaitlistForm formId={formId} departure={departure} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
