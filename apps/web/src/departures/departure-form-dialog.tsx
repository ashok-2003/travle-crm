"use client";

// Adding a departure, or changing one (release 7a): its name, destination, days, seats, the price per person and the last
// day to book. Checked by the api's own schema. The seats sold and held are never typed: they come from the bookings.
import {
  createDepartureInput,
  type CreateDepartureInput,
  type DepartureDetail,
  type UpdateDepartureInput,
} from "@travel-crm/contracts/departures";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { DestinationField, type DestinationValue } from "@/leads/form/destination-field";
import { NoteField } from "@/leads/form/note-field";
import { useDepartureChanges } from "./use-departures";

type Problem = "required" | "invalid";
type Changes = ReturnType<typeof useDepartureChanges>;

interface Values {
  title: string;
  destination: DestinationValue | null;
  startDate: string;
  endDate: string;
  seatsTotal: string;
  price: string;
  cutoffOn: string;
  notes: string;
}

const fields = ["title", "destination", "startDate", "endDate", "seatsTotal", "price", "cutoffOn", "notes"] as const;
const renamed: Partial<Record<string, (typeof fields)[number]>> = {
  destinationId: "destination",
  pricePaise: "price",
};

function toInput(typed: Values): ReturnType<typeof createDepartureInput.safeParse> {
  const price = typed.price.trim() === "" ? null : (paiseFromRupeesText(typed.price) ?? -1);
  return createDepartureInput.safeParse({
    title: typed.title,
    destinationId: typed.destination?.kind === "existing" ? typed.destination.destinationId : null,
    startDate: typed.startDate,
    endDate: typed.endDate,
    seatsTotal: /^\d+$/.test(typed.seatsTotal.trim()) ? Number(typed.seatsTotal) : -1,
    pricePaise: price,
    cutoffOn: typed.cutoffOn === "" ? null : typed.cutoffOn,
    notes: typed.notes,
  });
}

function DepartureForm({
  formId,
  departure,
  changes,
  dialog,
  onSaved,
}: {
  formId: string;
  departure: DepartureDetail | null;
  changes: Changes;
  dialog: { onSuccess: () => Promise<void> };
  onSaved?: ((id: string) => void) | undefined;
}) {
  const t = useTranslations("departures.form");
  const sending = departure === null ? changes.create : changes.update;
  const values: Values = {
    title: departure?.title ?? "",
    destination:
      departure?.destinationId == null
        ? null
        : { kind: "existing", destinationId: departure.destinationId, name: departure.destinationName ?? "" },
    startDate: departure?.startDate ?? "",
    endDate: departure?.endDate ?? "",
    seatsTotal: departure === null ? "" : String(departure.seatsTotal),
    price: departure?.pricePaise == null ? "" : rupeesFieldText(departure.pricePaise),
    cutoffOn: departure?.cutoffOn ?? "",
    notes: departure?.notes ?? "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CreateDepartureInput, Problem>(
    values,
    (typed) =>
      checked(
        toInput(typed),
        typed,
        (path) => {
          const key = String(path[0]);
          return renamed[key] ?? fields.find((field) => field === key);
        },
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const busy = sending.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        if (departure === null) {
          changes.create.mutate(input, {
            onSuccess: (created) => {
              void dialog.onSuccess().then(() => onSaved?.(created.id));
            },
          });
        } else {
          const update: UpdateDepartureInput = { departureId: departure.id, ...input };
          changes.update.mutate(update, { onSuccess: () => void dialog.onSuccess() });
        }
      })}
    >
      <TextField control={form.control} name="title" label={t("title")} hint={t("titleHint")} disabled={busy} />
      <DestinationField control={form.control} name="destination" label={t("destination")} />
      <DateField control={form.control} name="startDate" label={t("startDate")} />
      <DateField control={form.control} name="endDate" label={t("endDate")} />
      <TextField control={form.control} name="seatsTotal" label={t("seatsTotal")} inputMode="numeric" disabled={busy} />
      <MoneyField control={form.control} name="price" label={t("price")} hint={t("priceHint")} />
      <DateField control={form.control} name="cutoffOn" label={t("cutoff")} hint={t("cutoffHint")} />
      <NoteField control={form.control} name="notes" label={t("notes")} disabled={busy} />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function DepartureFormDialog({
  departure,
  trigger,
  onSaved,
}: {
  /** Null to add one. */
  departure: DepartureDetail | null;
  trigger: { label: string; variant?: "default" | "outline" };
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations("departures.form");
  const dialog = useFormDialog(t("saved"));
  const changes = useDepartureChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={departure === null ? changes.create : changes.update}
      trigger={trigger}
      title={departure === null ? t("newTitle") : t("editTitle")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <DepartureForm formId={formId} departure={departure} changes={changes} dialog={dialog} onSaved={onSaved} />
      )}
    </FormDialog>
  );
}
