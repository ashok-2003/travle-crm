"use client";

// Prices & dates' form (/packages/<id>): the kind of trip and, for a group trip, the room types it sells, the days and
// months it departs, the seats on each, the advance to hold a seat and where it starts. Saved alone through
// packages.updatePart, which makes the departures that now fit, as a full save did. Clearing the advance of the only
// package a switched-on AI agent sells says that the agent then answers no chat.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  packageKinds,
  roomTypes,
  updatePackagePartInput,
  type PackageDetail,
  type PackageKind,
  type UpdatePackagePartInput,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { MONTHS, Picks, useOnlyPackageOnSale, WEEKDAYS } from "./group-fields";
import { SectionForm, useSectionSave } from "./package-section";

type Problem = "required" | "invalid" | "price";
interface Values {
  kind: PackageKind;
  roomTypes: string[];
  /** Days as "0" (Sunday) to "6", months as "1" to "12": a toggle group's values are text. */
  weeklyDays: string[];
  departureMonths: string[];
  seatsPerDeparture: string;
  advancePerPerson: string;
  startCity: string;
}

/** The form's field each of the input's fields belongs to. */
const fieldOf: Partial<Record<string, keyof Values>> = {
  kind: "kind",
  roomTypes: "roomTypes",
  weeklyDays: "weeklyDays",
  departureMonths: "departureMonths",
  seatsPerDeparture: "seatsPerDeparture",
  advancePerPersonPaise: "advancePerPerson",
  startCity: "startCity",
};

const valuesOf = (detail: PackageDetail): Values => ({
  kind: detail.kind,
  roomTypes: detail.roomTypes,
  weeklyDays: detail.weeklyDays.map(String),
  departureMonths: detail.departureMonths.map(String),
  seatsPerDeparture: detail.seatsPerDeparture === null ? "" : String(detail.seatsPerDeparture),
  advancePerPerson: detail.advancePerPersonPaise === null ? "" : rupeesFieldText(detail.advancePerPersonPaise),
  startCity: detail.startCity,
});

/** The values as the api's fields; text that is not a number or an amount becomes -1, which its schema refuses. */
function toInput(packageId: string, typed: Values) {
  const seats = typed.seatsPerDeparture.trim();
  const advance = typed.advancePerPerson.trim();
  return updatePackagePartInput.safeParse({
    packageId,
    kind: typed.kind,
    roomTypes: typed.roomTypes,
    weeklyDays: typed.weeklyDays.map(Number),
    departureMonths: typed.departureMonths.map(Number),
    seatsPerDeparture: seats === "" ? null : /^\d{1,4}$/.test(seats) ? Number(seats) : -1,
    advancePerPersonPaise: advance === "" ? null : (paiseFromRupeesText(advance) ?? -1),
    startCity: typed.startCity,
  });
}

export function PricesEditor({ detail, close }: { detail: PackageDetail; close: () => void }) {
  const t = useTranslations("packages.form");
  const { updatePart, save } = useSectionSave("prices", close);
  const { form, onSubmit, formProblem } = useCheckedForm<Values, UpdatePackagePartInput, Problem>(
    valuesOf(detail),
    (typed) =>
      checked(
        toInput(detail.id, typed),
        typed,
        (path) => fieldOf[String(path[0])],
        (field) => (field === "advancePerPerson" ? "price" : "invalid"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  const kind = useWatch({ control: form.control, name: "kind" });
  const advance = useWatch({ control: form.control, name: "advancePerPerson" });
  const onlyOnSale = useOnlyPackageOnSale(detail);
  const busy = updatePart.isPending;
  return (
    <SectionForm onSubmit={onSubmit(save)} sending={updatePart} problem={formProblem} onCancel={close}>
      <ChoiceField
        control={form.control}
        name="kind"
        legend={t("kind")}
        options={packageKinds.map((value) => ({ value, label: t(`kinds.${value}`) }))}
      />
      {kind === "group" && (
        <>
          <Picks
            control={form.control}
            name="roomTypes"
            legend={t("roomTypes")}
            options={roomTypes.map((value) => ({ value, label: t(`roomTypeNames.${value}`) }))}
            disabled={busy}
          />
          <Picks
            control={form.control}
            name="weeklyDays"
            legend={t("weeklyDays")}
            options={WEEKDAYS.map((value) => ({ value, label: t(`weekdays.${value}`) }))}
            disabled={busy}
          />
          <Picks
            control={form.control}
            name="departureMonths"
            legend={t("departureMonths")}
            hint={t("departureMonthsHint")}
            options={MONTHS.map((value) => ({ value, label: t(`months.${value}`) }))}
            disabled={busy}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="seatsPerDeparture"
              label={t("seatsPerDeparture")}
              inputMode="numeric"
              disabled={busy}
            />
            <TextField control={form.control} name="startCity" label={t("startCity")} disabled={busy} />
            <MoneyField
              control={form.control}
              name="advancePerPerson"
              label={t("advancePerPerson")}
              {...(onlyOnSale && advance.trim() === "" ? { hint: t("advanceOnlyOnSale") } : {})}
            />
          </div>
        </>
      )}
    </SectionForm>
  );
}
