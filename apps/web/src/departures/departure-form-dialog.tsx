"use client";

// Adding a departure, or changing one (release 7a): its name, destination, days, seats, the price per person and the last
// day to book. Checked by the api's own schema. The seats sold and held are never typed: they come from the bookings.
import {
  createDepartureInput,
  type CreateDepartureInput,
  type DepartureDetail,
  type UpdateDepartureInput,
} from "@travel-crm/contracts/departures";
import { isCalendarDate, paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { addDays, parseCalendarDate } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { DestinationField, type DestinationValue } from "@/leads/form/destination-field";
import { NoteField } from "@/leads/form/note-field";
import {
  roomPriceFieldAt,
  roomPriceKey,
  roomPricesFromText,
  roomPricesToText,
  shownRoomTypes,
  usePackagePricing,
  gstWording,
  type RoomPriceValues,
} from "@/room-prices/room-prices";
import { useDepartureChanges } from "./use-departures";

/** A group package a new departure is made for: what the form starts from. */
export interface DepartureOfPackage {
  id: string;
  name: string;
  destination: { id: string; name: string } | null;
  nights: number | null;
  seatsPerDeparture: number | null;
}

type Problem = "required" | "invalid";
type Changes = ReturnType<typeof useDepartureChanges>;

interface Values extends RoomPriceValues {
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

function toInput(
  typed: Values,
  templateId: string | null,
  prices: CreateDepartureInput["prices"],
): ReturnType<typeof createDepartureInput.safeParse> {
  // A linked departure has no single price to send: its figure is made from its room prices.
  const price = templateId !== null || typed.price.trim() === "" ? null : (paiseFromRupeesText(typed.price) ?? -1);
  return createDepartureInput.safeParse({
    title: typed.title,
    destinationId: typed.destination?.kind === "existing" ? typed.destination.destinationId : null,
    startDate: typed.startDate,
    endDate: typed.endDate,
    seatsTotal: /^\d+$/.test(typed.seatsTotal.trim()) ? Number(typed.seatsTotal) : -1,
    pricePaise: price,
    cutoffOn: typed.cutoffOn === "" ? null : typed.cutoffOn,
    notes: typed.notes,
    templateId,
    prices,
  });
}

function DepartureForm({
  formId,
  departure,
  forPackage,
  changes,
  dialog,
  onSaved,
}: {
  formId: string;
  departure: DepartureDetail | null;
  forPackage: DepartureOfPackage | null;
  changes: Changes;
  dialog: { onSuccess: () => Promise<void> };
  onSaved?: ((id: string) => void) | undefined;
}) {
  const t = useTranslations("departures.form");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const sending = departure === null ? changes.create : changes.update;
  const values: Values = {
    title: departure?.title ?? forPackage?.name ?? "",
    destination:
      departure?.destinationId == null
        ? forPackage?.destination == null
          ? null
          : { kind: "existing", destinationId: forPackage.destination.id, name: forPackage.destination.name }
        : { kind: "existing", destinationId: departure.destinationId, name: departure.destinationName ?? "" },
    startDate: departure?.startDate ?? "",
    endDate: departure?.endDate ?? "",
    seatsTotal:
      departure === null
        ? forPackage?.seatsPerDeparture == null
          ? ""
          : String(forPackage.seatsPerDeparture)
        : String(departure.seatsTotal),
    price: departure?.pricePaise == null ? "" : rupeesFieldText(departure.pricePaise),
    cutoffOn: departure?.cutoffOn ?? "",
    notes: departure?.notes ?? "",
    ...roomPricesToText(departure?.prices),
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CreateDepartureInput, Problem>(
    values,
    (typed) => {
      // A linked departure's prices are the room prices typed; any other has none, and its one price above.
      const { prices, unreadable } = roomPricesFromText(typed);
      return checked(
        toInput(typed, departure?.templateId ?? forPackage?.id ?? null, prices),
        typed,
        (path) => {
          const key = String(path[0]);
          if (key === "prices") return roomPriceFieldAt(path);
          return renamed[key] ?? fields.find((field) => field === key);
        },
        () => "invalid",
        unreadable,
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  const busy = sending.isPending;
  const linked = departure?.templateId ?? forPackage?.id ?? null;
  const nights = forPackage?.nights ?? null;
  // A new departure of a package ends the package's nights after it starts, until the end is typed.
  const start = useWatch({ control: form.control, name: "startDate" });
  useEffect(() => {
    if (nights === null || departure !== null || form.getFieldState("endDate").isDirty) return;
    if (isCalendarDate(start)) form.setValue("endDate", addDays(parseCalendarDate(start), nights));
  }, [start, nights, departure, form]);
  const pricing = usePackagePricing(linked);
  const rooms = shownRoomTypes(pricing?.roomTypes, departure?.prices);
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
      {linked ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="font-medium">{t("roomPrices", { gst: gstWording(pricing) })}</legend>
          <p className="text-muted-foreground">{t("roomPricesHint")}</p>
          {rooms.map((room) => (
            <MoneyField
              key={room}
              control={form.control}
              name={roomPriceKey(room)}
              label={t("roomPrice", { room: tRooms(room) })}
            />
          ))}
        </fieldset>
      ) : (
        <MoneyField control={form.control} name="price" label={t("price")} hint={t("priceHint")} />
      )}
      <DateField control={form.control} name="cutoffOn" label={t("cutoff")} hint={t("cutoffHint")} />
      <NoteField control={form.control} name="notes" label={t("notes")} disabled={busy} />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function DepartureFormDialog({
  departure,
  forPackage = null,
  trigger,
  onSaved,
}: {
  /** Null to add one. */
  departure: DepartureDetail | null;
  /** To add a departure of this group package: its words, destination, nights and seats start the form. */
  forPackage?: DepartureOfPackage | null;
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
        <DepartureForm
          formId={formId}
          departure={departure}
          forPackage={forPackage}
          changes={changes}
          dialog={dialog}
          onSaved={onSaved}
        />
      )}
    </FormDialog>
  );
}
