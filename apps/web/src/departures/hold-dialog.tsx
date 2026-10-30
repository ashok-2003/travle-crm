"use client";

// Holding seats for a lead (release 7a): the lead, how many seats, and for how long (the agency's usual hours unless a
// shorter time is typed). A second hold for the same lead, or more than the free seats, is refused with its own sentence.
import { createHoldInput, type CreateHoldInput, type DepartureDetail } from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { NoteField } from "@/leads/form/note-field";
import { LeadPicker, type PickedLead } from "@/today/lead-picker";
import { useDepartureChanges, useDepartureSettings } from "./use-departures";

type Problem = "required" | "invalid";

interface Values {
  lead: PickedLead | null;
  seats: string;
  hours: string;
  note: string;
}

const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : -1);

function HoldForm({
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
  const t = useTranslations("departures.seats.holdDialog");
  const settings = useDepartureSettings();
  const values: Values = { lead: null, seats: "", hours: "", note: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CreateHoldInput, Problem>(
    values,
    (typed) =>
      checked(
        createHoldInput.safeParse({
          departureId: departure.id,
          leadId: typed.lead?.id ?? "",
          seats: whole(typed.seats),
          ...(typed.hours.trim() === "" ? {} : { hours: whole(typed.hours) }),
          note: typed.note,
        }),
        typed,
        (path) => {
          const key = String(path[0]);
          return key === "leadId" ? "lead" : (["seats", "hours", "note"] as const).find((field) => field === key);
        },
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
        changes.hold.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <Controller
        control={form.control}
        name="lead"
        render={({ field, fieldState }) => (
          <FormField label={t("lead")} hint={t("leadHint")} error={fieldState.error?.message}>
            {(links) => <LeadPicker links={links} value={field.value} onChange={field.onChange} />}
          </FormField>
        )}
      />
      <TextField
        control={form.control}
        name="seats"
        label={t("seats")}
        inputMode="numeric"
        disabled={changes.hold.isPending}
      />
      <TextField
        control={form.control}
        name="hours"
        label={t("hours")}
        {...(settings.data === undefined ? {} : { hint: t("hoursHint", { hours: settings.data.holdHours }) })}
        inputMode="numeric"
        disabled={changes.hold.isPending}
      />
      <NoteField control={form.control} name="note" label={t("note")} disabled={changes.hold.isPending} />
      <FormAlert sending={changes.hold} problem={formProblem} />
    </form>
  );
}

export function HoldDialog({ departure }: { departure: DepartureDetail }) {
  const t = useTranslations("departures.seats.holdDialog");
  const dialog = useFormDialog(t("saved"));
  const changes = useDepartureChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.hold}
      trigger={{ label: t("save"), variant: "default" }}
      title={t("title")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <HoldForm formId={formId} departure={departure} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
