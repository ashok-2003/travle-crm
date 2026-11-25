"use client";

// Adding a season, and changing a price-table column's dates (season-dialog.tsx, rename-season-dialog.tsx). A season is
// added from the table's top: its name, its first day, a last day or "until I change it" (it then runs to the day
// before the next season, or with no end), and a price per person for each room type sold, starting from the first
// column's. Changing dates moves each piece of a column; the last piece may have "no end date". Checked by the api's own
// schemas; dates that overlap another season are refused, and said on the dates.
import {
  OPEN_SEASON_END,
  savePackageSeasonInput,
  saveSpecialPricesInput,
  type RoomPrices,
  type RoomType,
  type SavePackageSeasonInput,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { Controller, useWatch, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { z } from "zod";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { MoneyField } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  gstWording,
  roomPriceFieldAt,
  roomPriceKey,
  roomPricesFromText,
  roomPricesToText,
  type RoomPriceKey,
  type RoomPriceValues,
} from "@/room-prices/room-prices";
import { useSeasonDates } from "./season-dates";
import { usePackageColumnChanges } from "./use-packages";

/** A switch with its label beside it, for a form that keeps the choice in its values. */
function SwitchField<Values extends FieldValues>({
  control,
  name,
  label,
  id,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  id: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className="min-h-11">
          <Switch id={id} checked={field.value === true} onCheckedChange={field.onChange} />
          <FieldLabel htmlFor={id} className="font-normal">
            {label}
          </FieldLabel>
        </Field>
      )}
    />
  );
}

type AddProblem = "required" | "invalid" | "noPrice";
type AddValues = { label: string; startsOn: string; endsOn: string; untilChanged: boolean } & RoomPriceValues;
const addFields = ["label", "startsOn", "endsOn"] as const;

function AddSeasonForm({
  formId,
  packageId,
  rooms,
  prefill,
  dialog,
}: {
  formId: string;
  packageId: string;
  rooms: readonly RoomType[];
  prefill: RoomPrices | undefined;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("packages.season");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const { addSeason } = usePackageColumnChanges();
  const { form, onSubmit, formProblem } = useCheckedForm<AddValues, z.infer<typeof saveSpecialPricesInput>, AddProblem>(
    { label: "", startsOn: "", endsOn: "", untilChanged: false, ...roomPricesToText(prefill) },
    (typed) => {
      const { prices, unreadable } = roomPricesFromText(typed);
      const found: Partial<Record<RoomPriceKey, "invalid" | "noPrice">> = { ...unreadable };
      const parsed = saveSpecialPricesInput.safeParse({
        packageId,
        label: typed.label,
        startsOn: typed.startsOn,
        endsOn: typed.untilChanged ? null : typed.endsOn,
        prices,
      });
      // "At least one price" is about the prices as a whole: said under the first room's.
      const first = rooms[0];
      if (first !== undefined && parsed.error?.issues.some((i) => i.path[0] === "prices" && i.path.length === 1)) {
        found[roomPriceKey(first)] ??= "noPrice";
      }
      return checked(
        parsed,
        typed,
        (path) => {
          const key = String(path[0]);
          if (key === "prices") return roomPriceFieldAt(path);
          return addFields.find((field) => field === key);
        },
        () => "invalid",
        found,
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  const untilChanged = useWatch({ control: form.control, name: "untilChanged" });
  const alert = useRefusalOnField(form, addSeason.error, { PACKAGE_SEASON_OVERLAPS: "startsOn" });
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        addSeason.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="label" label={t("label")} hint={t("labelHint")} />
      <DateField control={form.control} name="startsOn" label={t("startsOn")} />
      <SwitchField control={form.control} name="untilChanged" label={t("untilChanged")} id={`${formId}-until`} />
      {untilChanged ? (
        <p className="text-caption text-muted-foreground">{t("untilChangedHint")}</p>
      ) : (
        <DateField control={form.control} name="endsOn" label={t("endsOn")} />
      )}
      {rooms.map((room) => (
        <MoneyField
          key={room}
          control={form.control}
          name={roomPriceKey(room)}
          label={t("price", { room: tRooms(room) })}
        />
      ))}
      <FormAlert sending={{ error: alert }} problem={formProblem} />
    </form>
  );
}

export function AddSeasonDialog({
  packageId,
  rooms,
  prefill,
  pricesIncludeGst,
  held,
  returnFocusTo,
}: {
  packageId: string;
  rooms: readonly RoomType[];
  /** The first column's prices, which the new season starts from. */
  prefill: RoomPrices | undefined;
  pricesIncludeGst: boolean;
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.season");
  const dialog = useFormDialog(t("saved"), undefined, held);
  const { addSeason } = usePackageColumnChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={addSeason}
      returnFocusTo={returnFocusTo}
      title={t("addTitle")}
      description={t("addDescription", { gst: gstWording({ pricesIncludeGst }) })}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <AddSeasonForm formId={formId} packageId={packageId} rooms={rooms} prefill={prefill} dialog={dialog} />
      )}
    </FormDialog>
  );
}

type RangeKey = `start${number}` | `end${number}`;
type DatesValues = { noEnd: boolean } & Record<RangeKey, string>;

function ChangeDatesForm({
  formId,
  packageId,
  column,
  dialog,
}: {
  formId: string;
  packageId: string;
  column: SeasonColumn;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("packages.season");
  const describeDates = useSeasonDates();
  const { saveSeasons } = usePackageColumnChanges();
  const last = column.ranges.length - 1;
  const defaults = Object.fromEntries([
    ["noEnd", column.ranges[last]?.endsOn === OPEN_SEASON_END],
    ...column.ranges.flatMap((range, index) => [
      [`start${String(index)}`, range.startsOn],
      [`end${String(index)}`, range.endsOn === OPEN_SEASON_END ? "" : range.endsOn],
    ]),
  ]) as DatesValues;
  const { form, onSubmit, formProblem } = useCheckedForm<DatesValues, SavePackageSeasonInput[], "required" | "invalid">(
    defaults,
    (typed) => {
      const inputs = column.seasonIds.map((seasonId, index) => ({
        packageId,
        seasonId,
        label: column.label,
        startsOn: typed[`start${String(index)}` as RangeKey],
        endsOn: index === last && typed.noEnd ? OPEN_SEASON_END : typed[`end${String(index)}` as RangeKey],
        prices: column.prices,
      }));
      return checked(
        z.array(savePackageSeasonInput).safeParse(inputs),
        typed,
        (path) => {
          const [index, key] = path;
          if (typeof index !== "number") return undefined;
          return `${key === "startsOn" ? "start" : "end"}${String(index)}` as RangeKey;
        },
        () => "invalid",
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  const noEnd = useWatch({ control: form.control, name: "noEnd" });
  const alert = useRefusalOnField(form, saveSeasons.error, { PACKAGE_SEASON_OVERLAPS: "start0" });
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((inputs) => {
        saveSeasons.mutate(inputs, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <p className="text-muted-foreground">{describeDates(column, 1)}</p>
      {column.ranges.map((range, index) => (
        <div key={range.startsOn} className="flex flex-col gap-4">
          <DateField
            control={form.control}
            name={`start${String(index)}` as RangeKey}
            label={column.ranges.length > 1 ? `${t("startsOn")} (${t("range", { number: index + 1 })})` : t("startsOn")}
          />
          {!(index === last && noEnd) && (
            <DateField
              control={form.control}
              name={`end${String(index)}` as RangeKey}
              label={column.ranges.length > 1 ? `${t("endsOn")} (${t("range", { number: index + 1 })})` : t("endsOn")}
            />
          )}
        </div>
      ))}
      <SwitchField control={form.control} name="noEnd" label={t("noEnd")} id={`${formId}-no-end`} />
      <FormAlert sending={{ error: alert }} problem={formProblem} />
    </form>
  );
}

export function ChangeDatesDialog({
  packageId,
  column,
  held,
  returnFocusTo,
}: {
  packageId: string;
  column: SeasonColumn;
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.season");
  const dialog = useFormDialog(t("datesSaved"), undefined, held);
  const { saveSeasons } = usePackageColumnChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={saveSeasons}
      returnFocusTo={returnFocusTo}
      title={t("datesTitle", { season: column.label })}
      description={t("datesDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <ChangeDatesForm formId={formId} packageId={packageId} column={column} dialog={dialog} />}
    </FormDialog>
  );
}
