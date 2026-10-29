"use client";

// A stay on a booking (release 6): the hotel, its address and map link, the days and the room and meal notes the voucher
// prints. Changing a stay shows its voucher as out of date, to be issued again.
import { saveStayInput, type SaveStayInput, type Stay } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { NoteField } from "@/leads/form/note-field";
import { useBookingChanges } from "./use-bookings";

type Changes = ReturnType<typeof useBookingChanges>;
type Problem = "required" | "invalid";

function StayForm({
  formId,
  bookingId,
  stay,
  saveStay,
  dialog,
}: {
  formId: string;
  bookingId: string;
  stay: Stay | null;
  saveStay: Changes["saveStay"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.stays.form");
  const values = {
    name: stay?.name ?? "",
    address: stay?.address ?? "",
    mapUrl: stay?.mapUrl ?? "",
    checkIn: stay?.checkIn ?? "",
    checkOut: stay?.checkOut ?? "",
    notes: stay?.notes ?? "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, SaveStayInput, Problem>(
    values,
    (typed) =>
      checked(
        saveStayInput.safeParse({ bookingId, ...(stay === null ? {} : { stayId: stay.id }), ...typed }),
        typed,
        (path) => (String(path[0]) in values ? (String(path[0]) as keyof typeof values) : undefined),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const busy = saveStay.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        saveStay.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="name" label={t("name")} disabled={busy} />
      <TextField control={form.control} name="address" label={t("address")} disabled={busy} />
      <TextField
        control={form.control}
        name="mapUrl"
        label={t("mapUrl")}
        hint={t("mapUrlHint")}
        type="url"
        disabled={busy}
      />
      <DateField control={form.control} name="checkIn" label={t("checkIn")} />
      <DateField control={form.control} name="checkOut" label={t("checkOut")} />
      <NoteField control={form.control} name="notes" label={t("notes")} hint={t("notesHint")} disabled={busy} />
      <FormAlert sending={saveStay} problem={formProblem} />
    </form>
  );
}

export function StayDialog({ bookingId, stay }: { bookingId: string; stay: Stay | null }) {
  const t = useTranslations("bookings.stays");
  const dialog = useFormDialog(t("saved"));
  const { saveStay } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={saveStay}
      trigger={
        stay === null
          ? { label: t("add"), variant: "outline" }
          : { label: t("edit"), accessibleLabel: t("editNamed", { name: stay.name }), variant: "outline" }
      }
      title={stay === null ? t("addTitle") : t("editTitle")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <StayForm formId={formId} bookingId={bookingId} stay={stay} saveStay={saveStay} dialog={dialog} />}
    </FormDialog>
  );
}
