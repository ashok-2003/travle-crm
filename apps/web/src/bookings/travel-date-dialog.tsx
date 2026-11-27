"use client";

// A booking's travel date (bookings revamp): staff set it when the booking has none, or change it. The end date, the details
// cut-off and the reminders not yet sent move with it; the payments due stay as they are. Opened by its own button (Needs
// you's "Add the travel date") or, `held`, by the item of a menu. A booking on a departure follows the departure, so it has
// no such dialog.
import { setTravelDateInput, type BookingDetail, type SetTravelDateInput } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useBookingChanges } from "./use-bookings";

type Changes = ReturnType<typeof useBookingChanges>;

function TravelDateForm({
  formId,
  booking,
  setTravelDate,
  dialog,
}: {
  formId: string;
  booking: BookingDetail;
  setTravelDate: Changes["setTravelDate"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.travelDate");
  const values = { startDate: booking.startDate ?? "" };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, SetTravelDateInput, "required" | "invalid">(
    values,
    (typed) =>
      checked(
        setTravelDateInput.safeParse({ bookingId: booking.id, ...typed }),
        typed,
        (path) => (path[0] === "startDate" ? path[0] : undefined),
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
        setTravelDate.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <DateField control={form.control} name="startDate" label={t("field")} />
      <FormAlert sending={setTravelDate} problem={formProblem} />
    </form>
  );
}

export function TravelDateDialog({
  booking,
  held,
  returnFocusTo,
}: {
  booking: BookingDetail;
  held?: OpenState;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("bookings.travelDate");
  const dialog = useFormDialog(t("saved"), undefined, held);
  const { setTravelDate } = useBookingChanges();
  const adding = booking.startDate === null;
  return (
    <FormDialog
      dialog={dialog}
      sending={setTravelDate}
      {...(held === undefined ? { trigger: { label: t("add"), variant: "outline" as const } } : { returnFocusTo })}
      title={adding ? t("addTitle") : t("changeTitle")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <TravelDateForm formId={formId} booking={booking} setTravelDate={setTravelDate} dialog={dialog} />}
    </FormDialog>
  );
}
