"use client";

// A room at a stay (release 7a): its number or name, how many beds, and whether it is on the ground floor. A room can't be
// made smaller than the people already in it.
import { addRoomInput, type AddRoomInput, type RoomingRoom } from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Controller } from "react-hook-form";
import { useRoomingChanges } from "./use-departures";

type Problem = "required" | "invalid";
interface Values {
  label: string;
  capacity: string;
  groundFloor: boolean;
}

function RoomForm({
  formId,
  stayId,
  room,
  changes,
  dialog,
}: {
  formId: string;
  stayId: string;
  room: RoomingRoom | null;
  changes: ReturnType<typeof useRoomingChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("departures.rooming.roomForm");
  const sending = room === null ? changes.addRoom : changes.updateRoom;
  const values: Values = {
    label: room?.label ?? "",
    capacity: String(room?.capacity ?? 2),
    groundFloor: room?.groundFloor ?? false,
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, AddRoomInput, Problem>(
    values,
    (typed) =>
      checked(
        addRoomInput.safeParse({
          stayId,
          label: typed.label,
          capacity: Number(typed.capacity),
          groundFloor: typed.groundFloor,
        }),
        typed,
        (path) => (["label", "capacity", "groundFloor"] as const).find((field) => field === String(path[0])),
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
        if (room === null) {
          changes.addRoom.mutate(input, { onSuccess: () => void dialog.onSuccess() });
        } else {
          changes.updateRoom.mutate(
            { roomId: room.id, label: input.label, capacity: input.capacity, groundFloor: input.groundFloor },
            { onSuccess: () => void dialog.onSuccess() },
          );
        }
      })}
    >
      <TextField
        control={form.control}
        name="label"
        label={t("label")}
        hint={t("labelHint")}
        disabled={sending.isPending}
      />
      <SelectField
        control={form.control}
        name="capacity"
        label={t("capacity")}
        disabled={sending.isPending}
        options={[1, 2, 3, 4].map((beds) => ({ value: String(beds), label: String(beds) }))}
      />
      <Controller
        control={form.control}
        name="groundFloor"
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id={`${formId}-ground`}
              checked={field.value}
              disabled={sending.isPending}
              onCheckedChange={(next) => {
                field.onChange(next === true);
              }}
            />
            <FieldLabel htmlFor={`${formId}-ground`}>{t("groundFloor")}</FieldLabel>
          </Field>
        )}
      />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function RoomDialog({ stayId, room }: { stayId: string; room: RoomingRoom | null }) {
  const t = useTranslations("departures.rooming");
  const dialog = useFormDialog(t("roomForm.saved"));
  const changes = useRoomingChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={room === null ? changes.addRoom : changes.updateRoom}
      trigger={
        room === null
          ? { label: t("addRoom"), variant: "outline" }
          : { label: t("edit"), accessibleLabel: t("editNamed", { label: room.label }), variant: "outline" }
      }
      title={room === null ? t("roomForm.addTitle") : t("roomForm.editTitle")}
      description={t("roomForm.description")}
      submit={t("roomForm.save")}
      submitting={t("roomForm.saving")}
    >
      {(formId) => <RoomForm formId={formId} stayId={stayId} room={room} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
