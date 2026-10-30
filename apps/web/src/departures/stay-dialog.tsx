"use client";

// A hotel stay on a departure (release 7a): the hotel, the supplier it is (when kept), and its days. Rooms are added to it
// afterwards; changing the days or the hotel makes a rooming list already sent read as out of date.
import { saveRoomingStayInput, type RoomingStay, type SaveRoomingStayInput } from "@travel-crm/contracts/departures";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useRoomingChanges } from "./use-departures";

type Problem = "required" | "invalid";
const NO_SUPPLIER = "none";

interface Values {
  hotelName: string;
  supplier: string;
  checkIn: string;
  checkOut: string;
}

function StayForm({
  formId,
  departureId,
  stay,
  changes,
  dialog,
}: {
  formId: string;
  departureId: string;
  stay: RoomingStay | null;
  changes: ReturnType<typeof useRoomingChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("departures.rooming.stayForm");
  const trpc = useTRPC();
  const maySeeSuppliers = useHolds("suppliers:view");
  const suppliers = useQuery({ ...trpc.suppliers.list.queryOptions({}), enabled: maySeeSuppliers });
  const values: Values = {
    hotelName: stay?.hotelName ?? "",
    supplier: stay?.supplierId ?? NO_SUPPLIER,
    checkIn: stay?.checkIn ?? "",
    checkOut: stay?.checkOut ?? "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SaveRoomingStayInput, Problem>(
    values,
    (typed) =>
      checked(
        saveRoomingStayInput.safeParse({
          departureId,
          ...(stay === null ? {} : { stayId: stay.id }),
          hotelName: typed.hotelName,
          supplierId: typed.supplier === NO_SUPPLIER ? null : typed.supplier,
          checkIn: typed.checkIn,
          checkOut: typed.checkOut,
        }),
        typed,
        (path) => {
          const key = String(path[0]);
          return key === "supplierId"
            ? "supplier"
            : (["hotelName", "checkIn", "checkOut"] as const).find((f) => f === key);
        },
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const busy = changes.saveStay.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.saveStay.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="hotelName" label={t("hotel")} disabled={busy} />
      {maySeeSuppliers && (
        <SelectField
          control={form.control}
          name="supplier"
          label={t("supplier")}
          hint={t("supplierHint")}
          disabled={busy}
          options={[
            { value: NO_SUPPLIER, label: t("noSupplier") },
            ...(suppliers.data?.items ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name })),
          ]}
        />
      )}
      <DateField control={form.control} name="checkIn" label={t("checkIn")} />
      <DateField control={form.control} name="checkOut" label={t("checkOut")} />
      <FormAlert sending={changes.saveStay} problem={formProblem} />
    </form>
  );
}

export function StayDialog({ departureId, stay }: { departureId: string; stay: RoomingStay | null }) {
  const t = useTranslations("departures.rooming");
  const dialog = useFormDialog(t("stayForm.saved"));
  const changes = useRoomingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.saveStay}
      trigger={
        stay === null
          ? { label: t("addStay"), variant: "outline" }
          : { label: t("editStay"), accessibleLabel: t("editStayNamed", { name: stay.hotelName }), variant: "outline" }
      }
      title={stay === null ? t("stayForm.addTitle") : t("stayForm.editTitle")}
      description={t("stayForm.description")}
      submit={t("stayForm.save")}
      submitting={t("stayForm.saving")}
    >
      {(formId) => <StayForm formId={formId} departureId={departureId} stay={stay} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
