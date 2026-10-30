"use client";

// Confirming a booking (release 6) and changing its payments due. Confirm is one tap: a booking whose quote already has its
// payments due is confirmed at once; otherwise the agency's default schedule (the advance now, the balance some days before
// departure) is shown, to keep or change, and made with the confirmation.
import type { BookingDetail, ScheduleRow } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { LoadingRows } from "@/components/loading-rows";
import { ScheduleForm } from "./schedule-form";
import { useBookingChanges, useDefaultSchedule } from "./use-bookings";

type Changes = ReturnType<typeof useBookingChanges>;

function OfferedSchedule({
  formId,
  booking,
  confirm,
  dialog,
}: {
  formId: string;
  booking: BookingDetail;
  confirm: Changes["confirm"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.confirm");
  const tCommon = useTranslations("common");
  const offered = useDefaultSchedule(booking.id, true);
  if (offered.data === undefined) {
    return offered.isError ? (
      <ErrorState
        message={t("scheduleFailed")}
        error={offered.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void offered.refetch()}
      />
    ) : (
      <LoadingRows rows={2} label={t("scheduleLoading")} />
    );
  }
  return (
    <ScheduleForm
      formId={formId}
      initial={offered.data.installments}
      totalPaise={booking.totalPaise}
      sending={confirm}
      onSave={(rows) => {
        confirm.mutate({ bookingId: booking.id, installments: rows }, { onSuccess: () => void dialog.onSuccess() });
      }}
    />
  );
}

export function ConfirmBookingDialog({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.confirm");
  const dialog = useFormDialog(t("confirmed"));
  const { confirm } = useBookingChanges();
  const hasSchedule = booking.installments.length > 0;
  return (
    <FormDialog
      dialog={dialog}
      sending={confirm}
      trigger={{ label: t("open"), variant: "default" }}
      title={t("title")}
      description={hasSchedule ? t("descriptionKept") : t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) =>
        hasSchedule ? (
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              confirm.mutate({ bookingId: booking.id }, { onSuccess: () => void dialog.onSuccess() });
            }}
          >
            <p className="text-muted-foreground">{t("keptBody")}</p>
          </form>
        ) : (
          <OfferedSchedule formId={formId} booking={booking} confirm={confirm} dialog={dialog} />
        )
      }
    </FormDialog>
  );
}

export function ChangeScheduleDialog({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.schedule");
  const dialog = useFormDialog(t("saved"));
  const { saveSchedule } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={saveSchedule}
      trigger={{ label: t("open"), variant: "outline" }}
      title={t("title")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <ScheduleForm
          formId={formId}
          initial={booking.installments.map((due): Omit<ScheduleRow, "id"> & { id: string } => ({
            id: due.id,
            label: due.label,
            amountPaise: due.amountPaise,
            dueOn: due.dueOn,
          }))}
          totalPaise={booking.totalPaise}
          sending={saveSchedule}
          onSave={(rows) => {
            saveSchedule.mutate(
              { bookingId: booking.id, installments: rows },
              { onSuccess: () => void dialog.onSuccess() },
            );
          }}
        />
      )}
    </FormDialog>
  );
}
