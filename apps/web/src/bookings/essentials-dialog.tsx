"use client";

// The trip's essentials as staff fill them (release 6): where and when to report, the driver or guide, and the emergency
// contact (the agency's own is offered). They show on the trip page and the itinerary, and the reporting reminder reads them.
import { saveEssentialsInput, type BookingDetail, type SaveEssentialsInput } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { TimeField } from "@/components/forms/time-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useBookingChanges } from "./use-bookings";

type Changes = ReturnType<typeof useBookingChanges>;

function EssentialsForm({
  formId,
  booking,
  saveEssentials,
  dialog,
}: {
  formId: string;
  booking: BookingDetail;
  saveEssentials: Changes["saveEssentials"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.essentials.form");
  const { essentials } = booking;
  const values = {
    reportingTime: essentials.reportingTime ?? "",
    reportingPlace: essentials.reportingPlace,
    driverName: essentials.driverName,
    driverPhone: essentials.driverPhone,
    emergencyName: essentials.emergencyName,
    emergencyPhone: essentials.emergencyPhone,
  };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, SaveEssentialsInput, "required" | "invalid">(
    values,
    (typed) =>
      checked(
        saveEssentialsInput.safeParse({
          bookingId: booking.id,
          ...typed,
          reportingTime: typed.reportingTime === "" ? null : typed.reportingTime,
        }),
        typed,
        (path) => (String(path[0]) in values ? (String(path[0]) as keyof typeof values) : undefined),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const busy = saveEssentials.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        saveEssentials.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TimeField control={form.control} name="reportingTime" label={t("reportingTime")} hint={t("reportingTimeHint")} />
      <TextField control={form.control} name="reportingPlace" label={t("reportingPlace")} disabled={busy} />
      <TextField control={form.control} name="driverName" label={t("driverName")} disabled={busy} />
      <TextField control={form.control} name="driverPhone" label={t("driverPhone")} type="tel" disabled={busy} />
      <TextField control={form.control} name="emergencyName" label={t("emergencyName")} disabled={busy} />
      <TextField control={form.control} name="emergencyPhone" label={t("emergencyPhone")} type="tel" disabled={busy} />
      <FormAlert sending={saveEssentials} problem={formProblem} />
    </form>
  );
}

export function EssentialsDialog({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.essentials");
  const dialog = useFormDialog(t("saved"));
  const { saveEssentials } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={saveEssentials}
      trigger={{ label: t("edit"), variant: "outline" }}
      title={t("title")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <EssentialsForm formId={formId} booking={booking} saveEssentials={saveEssentials} dialog={dialog} />}
    </FormDialog>
  );
}
