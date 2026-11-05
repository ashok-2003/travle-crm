"use client";

// A season of a group package (group packages): its name, its dates and the price per person of each room type sold.
// Checked by the api's own schema; dates that overlap another season are refused, and said on the dates.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  roomTypes,
  savePackageSeasonInput,
  type PackageSeasonView,
  type RoomPrices,
  type RoomType,
  type SavePackageSeasonInput,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { usePackageChanges } from "./use-packages";

type Problem = "required" | "invalid" | "noPrice";
type PriceKey = `price_${RoomType}`;
type Values = { label: string; startsOn: string; endsOn: string } & Record<PriceKey, string>;

const priceKey = (room: RoomType): PriceKey => `price_${room}`;
const plainFields = ["label", "startsOn", "endsOn"] as const;

/** The room types a season shows: those the package sells, and any the season already prices. */
export function shownRooms(offered: readonly RoomType[], season: PackageSeasonView | null): RoomType[] {
  return roomTypes.filter((room) => offered.includes(room) || (season !== null && season.prices[room] !== null));
}

function toInput(typed: Values, packageId: string, season: PackageSeasonView | null, rooms: readonly RoomType[]) {
  const found: Partial<Record<PriceKey, "invalid" | "noPrice">> = {};
  const price = (room: RoomType): number | null => {
    const text = typed[priceKey(room)].trim();
    if (text === "") return null;
    const paise = paiseFromRupeesText(text);
    if (paise === null) found[priceKey(room)] = "invalid";
    return paise;
  };
  const prices: RoomPrices = {
    single: price("single"),
    double: price("double"),
    triple: price("triple"),
    quad: price("quad"),
    child_bed: price("child_bed"),
    child_no_bed: price("child_no_bed"),
  };
  const parsed = savePackageSeasonInput.safeParse({
    packageId,
    ...(season === null ? {} : { seasonId: season.id }),
    label: typed.label,
    startsOn: typed.startsOn,
    endsOn: typed.endsOn,
    prices,
  });
  // "At least one price" is about the prices as a whole: said under the first room's.
  const first = rooms[0];
  if (
    first !== undefined &&
    parsed.error?.issues.some((issue) => issue.path[0] === "prices" && issue.path.length === 1)
  ) {
    found[priceKey(first)] ??= "noPrice";
  }
  return { parsed, found };
}

function SeasonForm({
  formId,
  packageId,
  season,
  rooms,
  changes,
  dialog,
}: {
  formId: string;
  packageId: string;
  season: PackageSeasonView | null;
  rooms: readonly RoomType[];
  changes: ReturnType<typeof usePackageChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("packages.season");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const start = (room: RoomType) => {
    const paise = season?.prices[room] ?? null;
    return paise === null ? "" : rupeesFieldText(paise);
  };
  const defaults: Values = {
    label: season?.label ?? "",
    startsOn: season?.startsOn ?? "",
    endsOn: season?.endsOn ?? "",
    price_single: start("single"),
    price_double: start("double"),
    price_triple: start("triple"),
    price_quad: start("quad"),
    price_child_bed: start("child_bed"),
    price_child_no_bed: start("child_no_bed"),
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SavePackageSeasonInput, Problem>(
    defaults,
    (typed) => {
      const { parsed, found } = toInput(typed, packageId, season, rooms);
      return checked(
        parsed,
        typed,
        (path) => {
          const key = String(path[0]);
          if (key === "prices") {
            const room = path.length === 1 ? rooms[0] : roomTypes.find((type) => type === path[1]);
            return room === undefined ? undefined : priceKey(room);
          }
          return plainFields.find((field) => field === key);
        },
        () => "invalid",
        found,
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  const alert = useRefusalOnField(form, changes.saveSeason.error, { PACKAGE_SEASON_OVERLAPS: "startsOn" });
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.saveSeason.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="label" label={t("label")} hint={t("labelHint")} />
      <DateField control={form.control} name="startsOn" label={t("startsOn")} />
      <DateField control={form.control} name="endsOn" label={t("endsOn")} />
      {rooms.map((room) => (
        <MoneyField
          key={room}
          control={form.control}
          name={priceKey(room)}
          label={t("price", { room: tRooms(room) })}
        />
      ))}
      <FormAlert sending={{ error: alert }} problem={formProblem} />
    </form>
  );
}

export function SeasonDialog({
  packageId,
  season,
  offered,
  held,
  returnFocusTo,
}: {
  packageId: string;
  /** Null to add one. */
  season: PackageSeasonView | null;
  offered: readonly RoomType[];
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.season");
  const dialog = useFormDialog(t("saved"), undefined, held);
  const changes = usePackageChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.saveSeason}
      returnFocusTo={returnFocusTo}
      title={season === null ? t("addTitle") : t("editTitle")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <SeasonForm
          key={season?.id ?? "new"}
          formId={formId}
          packageId={packageId}
          season={season}
          rooms={shownRooms(offered, season)}
          changes={changes}
          dialog={dialog}
        />
      )}
    </FormDialog>
  );
}
