"use client";

// Adding a season, from the top of the price table: its name, its first day, a last day or "until I change it" (it then
// runs to the day before the next season, or with no end), and a price per person for each room type sold, starting from
// the first column's. Checked by the api's own schema; dates that overlap another season are refused, and said on the dates.
import { saveSpecialPricesInput, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { MoneyField } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import type { ReturnFocusTo } from "@/components/return-focus";
import {
  gstWording,
  roomPriceFieldAt,
  roomPriceKey,
  roomPricesFromText,
  roomPricesToText,
  type RoomPriceKey,
  type RoomPriceValues,
} from "@/room-prices/room-prices";
import { SwitchField } from "./switch-field";
import { usePackageColumnChanges } from "./use-packages";

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
