"use client";

// Filling or fixing one traveller's details as staff (release 6): name, birthday, gender, phone; the emergency contact and
// medical notes at Detailed; the passport at International, for a member who may read ID numbers (documents:view_sensitive),
// who also sees the ID photos the traveller sent. A passport number typed here replaces the one on file; left empty, it is kept.
import { roomRequests } from "@travel-crm/contracts/departures";
import {
  gender,
  saveTravellerInput,
  type SaveTravellerInput,
  type Traveller,
  type TravellerLevel,
} from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { NoteField } from "@/leads/form/note-field";
import { useHolds } from "@/session/me-context";
import { useBookingChanges } from "./use-bookings";

type Changes = ReturnType<typeof useBookingChanges>;
type Problem = "required" | "invalid";
const NO_GENDER = "none";

function TravellerForm({
  formId,
  traveller,
  level,
  mayReadIds,
  onDeparture,
  saveTraveller,
  dialog,
}: {
  formId: string;
  traveller: Traveller;
  level: TravellerLevel;
  mayReadIds: boolean;
  /** The booking holds seats on a group departure, so the room request is asked. */
  onDeparture: boolean;
  saveTraveller: Changes["saveTraveller"];
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("bookings.travellers.form");
  const values = {
    name: traveller.name,
    dateOfBirth: traveller.dateOfBirth ?? "",
    gender: traveller.gender ?? NO_GENDER,
    phone: traveller.phone,
    emergencyName: traveller.emergencyName,
    emergencyPhone: traveller.emergencyPhone,
    medicalNotes: traveller.medicalNotes,
    roomRequest: traveller.roomRequest,
    roomNote: traveller.roomNote,
    passportNumber: "",
    passportIssuedOn: "",
    passportExpiresOn: "",
    nationality: "",
  };
  const showPassport = level === "international" && mayReadIds;
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, SaveTravellerInput, Problem>(
    values,
    (typed) =>
      checked(
        saveTravellerInput.safeParse({
          travellerId: traveller.id,
          name: typed.name.trim(),
          dateOfBirth: typed.dateOfBirth === "" ? null : typed.dateOfBirth,
          gender: typed.gender === NO_GENDER ? null : typed.gender,
          phone: typed.phone,
          emergencyName: typed.emergencyName,
          emergencyPhone: typed.emergencyPhone,
          medicalNotes: typed.medicalNotes,
          roomRequest: typed.roomRequest,
          roomNote: typed.roomNote,
          identity:
            showPassport && typed.passportNumber.trim() !== ""
              ? {
                  kind: "passport",
                  number: typed.passportNumber.trim(),
                  issuedOn: typed.passportIssuedOn === "" ? null : typed.passportIssuedOn,
                  expiresOn: typed.passportExpiresOn === "" ? null : typed.passportExpiresOn,
                  nationality: typed.nationality,
                }
              : null,
        }),
        typed,
        (path) => {
          const key = String(path[0]);
          if (key === "identity") {
            const inner = String(path[1]);
            return inner === "number"
              ? "passportNumber"
              : inner === "issuedOn"
                ? "passportIssuedOn"
                : inner === "expiresOn"
                  ? "passportExpiresOn"
                  : "nationality";
          }
          return key in values ? (key as keyof typeof values) : undefined;
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
        saveTraveller.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField
        control={form.control}
        name="name"
        label={t("name")}
        autoComplete="off"
        disabled={saveTraveller.isPending}
      />
      <DateField control={form.control} name="dateOfBirth" label={t("dateOfBirth")} />
      <SelectField
        control={form.control}
        name="gender"
        label={t("gender")}
        disabled={saveTraveller.isPending}
        options={[
          { value: NO_GENDER, label: t("genders.none") },
          ...gender.options.map((one) => ({ value: one, label: t(`genders.${one}`) })),
        ]}
      />
      <TextField control={form.control} name="phone" label={t("phone")} type="tel" disabled={saveTraveller.isPending} />
      {level !== "basic" && (
        <>
          <TextField
            control={form.control}
            name="emergencyName"
            label={t("emergencyName")}
            disabled={saveTraveller.isPending}
          />
          <TextField
            control={form.control}
            name="emergencyPhone"
            label={t("emergencyPhone")}
            type="tel"
            disabled={saveTraveller.isPending}
          />
          <NoteField
            control={form.control}
            name="medicalNotes"
            label={t("medicalNotes")}
            disabled={saveTraveller.isPending}
          />
        </>
      )}
      {onDeparture && (
        <>
          <SelectField
            control={form.control}
            name="roomRequest"
            label={t("roomRequest")}
            disabled={saveTraveller.isPending}
            options={roomRequests.map((request) => ({ value: request, label: t(`roomRequests.${request}`) }))}
          />
          <TextField control={form.control} name="roomNote" label={t("roomNote")} disabled={saveTraveller.isPending} />
        </>
      )}
      {showPassport && (
        <>
          <TextField
            control={form.control}
            name="passportNumber"
            label={t("passportNumber")}
            hint={traveller.hasIdentity ? t("passportKept") : t("passportHint")}
            autoComplete="off"
            disabled={saveTraveller.isPending}
          />
          <DateField control={form.control} name="passportIssuedOn" label={t("passportIssuedOn")} />
          <DateField control={form.control} name="passportExpiresOn" label={t("passportExpiresOn")} />
          <TextField
            control={form.control}
            name="nationality"
            label={t("nationality")}
            disabled={saveTraveller.isPending}
          />
        </>
      )}
      <FormAlert sending={saveTraveller} problem={formProblem} />
    </form>
  );
}

export function TravellerDialog({
  traveller,
  level,
  number,
  onDeparture,
}: {
  traveller: Traveller;
  level: TravellerLevel;
  number: number;
  onDeparture: boolean;
}) {
  const t = useTranslations("bookings.travellers");
  const dialog = useFormDialog(t("saved"));
  const mayReadIds = useHolds("documents:view_sensitive");
  const { saveTraveller } = useBookingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={saveTraveller}
      trigger={{
        label: traveller.complete ? t("edit") : t("fill"),
        accessibleLabel: t("editNamed", { number }),
        variant: "outline",
      }}
      title={t("title", { number })}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <TravellerForm
          formId={formId}
          traveller={traveller}
          level={level}
          mayReadIds={mayReadIds}
          onDeparture={onDeparture}
          saveTraveller={saveTraveller}
          dialog={dialog}
        />
      )}
    </FormDialog>
  );
}
