"use client";

// Special prices for a period of a group trip: its name, its first day and last (or "until I change them", no end) and
// the price per person of each room type sold. The api splits the trip's seasons around the period.
import {
  saveSpecialPricesInput,
  type PackageDetail,
  type RoomType,
  type SaveSpecialPricesInput,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useWatch } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { MoneyField } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  gstWording,
  roomPriceFieldAt,
  roomPriceKey,
  roomPricesFromText,
  roomPricesToText,
  shownRoomTypes,
  type RoomPriceKey,
  type RoomPriceValues,
} from "@/room-prices/room-prices";
import { usePackageChanges } from "./use-packages";

type Problem = "required" | "invalid" | "noPrice";
type Values = { label: string; startsOn: string; endsOn: string; openEnded: boolean } & RoomPriceValues;

const plainFields = ["label", "startsOn", "endsOn"] as const;

function toInput(typed: Values, packageId: string, rooms: readonly RoomType[]) {
  const { prices, unreadable } = roomPricesFromText(typed);
  const found: Partial<Record<RoomPriceKey, "invalid" | "noPrice">> = { ...unreadable };
  const parsed = saveSpecialPricesInput.safeParse({
    packageId,
    label: typed.label,
    startsOn: typed.startsOn,
    endsOn: typed.openEnded ? null : typed.endsOn,
    prices,
  });
  // "At least one price" is about the prices as a whole: said under the first room's.
  const first = rooms[0];
  if (
    first !== undefined &&
    parsed.error?.issues.some((issue) => issue.path[0] === "prices" && issue.path.length === 1)
  ) {
    found[roomPriceKey(first)] ??= "noPrice";
  }
  return { parsed, found };
}

function SpecialPricesForm({
  formId,
  detail,
  range,
  rooms,
  changes,
  dialog,
}: {
  formId: string;
  detail: PackageDetail;
  range: { from: string; to: string };
  rooms: readonly RoomType[];
  changes: ReturnType<typeof usePackageChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("packages.specialPrices");
  const tCalendar = useTranslations("packages.calendar");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const openEndedId = useId();
  const defaults: Values = {
    label: tCalendar("specialLabel"),
    startsOn: range.from,
    endsOn: range.to,
    openEnded: false,
    ...roomPricesToText(undefined),
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SaveSpecialPricesInput, Problem>(
    defaults,
    (typed) => {
      const { parsed, found } = toInput(typed, detail.id, rooms);
      return checked(
        parsed,
        typed,
        (path) => {
          const key = String(path[0]);
          if (key === "prices") {
            const first = rooms[0];
            return path.length === 1 && first !== undefined ? roomPriceKey(first) : roomPriceFieldAt(path);
          }
          return plainFields.find((field) => field === key);
        },
        () => "invalid",
        found,
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  const openEnded = useWatch({ control: form.control, name: "openEnded" });
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.saveSpecialPrices.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="label" label={t("label")} hint={t("labelHint")} />
      <DateField control={form.control} name="startsOn" label={t("startsOn")} />
      {!openEnded && <DateField control={form.control} name="endsOn" label={t("endsOn")} />}
      <Controller
        control={form.control}
        name="openEnded"
        render={({ field }) => (
          <Field orientation="horizontal" className="min-h-11">
            <Switch id={openEndedId} checked={field.value} onCheckedChange={field.onChange} />
            <FieldLabel htmlFor={openEndedId} className="font-normal">
              {t("openEnded")}
            </FieldLabel>
          </Field>
        )}
      />
      {rooms.map((room) => (
        <MoneyField
          key={room}
          control={form.control}
          name={roomPriceKey(room)}
          label={t("price", { room: tRooms(room) })}
        />
      ))}
      <FormAlert sending={changes.saveSpecialPrices} problem={formProblem} />
    </form>
  );
}

export function SpecialPricesDialog({
  detail,
  range,
  held,
  returnFocusTo,
}: {
  detail: PackageDetail;
  /** The days to start from (yyyy-mm-dd), "" for none. */
  range: { from: string; to: string };
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.specialPrices");
  const dialog = useFormDialog(t("saved"), undefined, held);
  const changes = usePackageChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.saveSpecialPrices}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={t("description", { gst: gstWording(detail) })}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <SpecialPricesForm
          formId={formId}
          detail={detail}
          range={range}
          rooms={shownRoomTypes(detail.roomTypes, undefined)}
          changes={changes}
          dialog={dialog}
        />
      )}
    </FormDialog>
  );
}
