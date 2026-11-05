"use client";

// The kind of a package and, for a group trip, what it sells (release 7b, group packages): the room types, the days and
// months it departs, seats, GST, the advance, how to pay, pickup and where it starts. The form holds them as text and
// lists of text; the input is made here so package-form.tsx stays about the quote.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { packageKinds, roomTypes, type PackageDetail, type PackageKind } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useWatch, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { ChoiceField } from "@/components/forms/choice-field";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NoteField } from "@/leads/form/note-field";

export interface GroupValues {
  kind: PackageKind;
  roomTypes: string[];
  /** Days as "0" (Sunday) to "6", months as "1" to "12": a toggle group's values are text. */
  weeklyDays: string[];
  departureMonths: string[];
  seatsPerDeparture: string;
  pricesIncludeGst: boolean;
  advancePerPerson: string;
  paymentDetails: string;
  pickupPoints: string;
  startCity: string;
}

export function groupValuesOf(detail: PackageDetail): GroupValues {
  return {
    kind: detail.kind,
    roomTypes: detail.roomTypes,
    weeklyDays: detail.weeklyDays.map(String),
    departureMonths: detail.departureMonths.map(String),
    seatsPerDeparture: detail.seatsPerDeparture === null ? "" : String(detail.seatsPerDeparture),
    pricesIncludeGst: detail.pricesIncludeGst,
    advancePerPerson: detail.advancePerPersonPaise === null ? "" : rupeesFieldText(detail.advancePerPersonPaise),
    paymentDetails: detail.paymentDetails,
    pickupPoints: detail.pickupPoints,
    startCity: detail.startCity,
  };
}

/** The values as the api's fields; text that is not a number or an amount becomes -1, which its schema refuses. */
export function groupInputOf(typed: GroupValues) {
  const seats = typed.seatsPerDeparture.trim();
  const advance = typed.advancePerPerson.trim();
  return {
    kind: typed.kind,
    roomTypes: typed.roomTypes,
    pricesIncludeGst: typed.pricesIncludeGst,
    advancePerPersonPaise: advance === "" ? null : (paiseFromRupeesText(advance) ?? -1),
    paymentDetails: typed.paymentDetails,
    pickupPoints: typed.pickupPoints,
    startCity: typed.startCity,
    weeklyDays: typed.weeklyDays.map(Number),
    departureMonths: typed.departureMonths.map(Number),
    seatsPerDeparture: seats === "" ? null : /^\d{1,4}$/.test(seats) ? Number(seats) : -1,
  };
}

/** The form's fields a group input's refusal belongs to. */
export const groupInputFields: Partial<Record<string, keyof GroupValues>> = {
  advancePerPersonPaise: "advancePerPerson",
  kind: "kind",
  roomTypes: "roomTypes",
  pricesIncludeGst: "pricesIncludeGst",
  paymentDetails: "paymentDetails",
  pickupPoints: "pickupPoints",
  startCity: "startCity",
  weeklyDays: "weeklyDays",
  departureMonths: "departureMonths",
  seatsPerDeparture: "seatsPerDeparture",
};

const WEEKDAYS = ["0", "1", "2", "3", "4", "5", "6"] as const;
const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

/** A toggle group's chosen values: the field holds a list of text. */
const picked = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

function Picks<Values extends FieldValues>({
  control,
  name,
  legend,
  hint,
  options,
  disabled,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  legend: string;
  hint?: string;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <ToggleGroup
            type="multiple"
            variant="outline"
            spacing={1}
            disabled={disabled}
            className="flex-wrap"
            value={picked(field.value)}
            onValueChange={field.onChange}
          >
            {options.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </FieldSet>
  );
}

/** Its fields are named by GroupValues' keys; a form of more values holds them under the same names. */
function at<Values extends FieldValues>(name: keyof GroupValues) {
  return name as FieldPath<Values>;
}

export function GroupFields<Values extends FieldValues>({
  control,
  disabled,
}: {
  control: Control<Values>;
  disabled: boolean;
}) {
  const t = useTranslations("packages.form");
  const kind = useWatch({ control, name: at<Values>("kind") });
  const gstId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("groupTitle")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChoiceField
          control={control}
          name={at<Values>("kind")}
          legend={t("kind")}
          options={packageKinds.map((value) => ({ value, label: t(`kinds.${value}`) }))}
        />
        {kind === "group" && (
          <>
            <Picks
              control={control}
              name={at<Values>("roomTypes")}
              legend={t("roomTypes")}
              options={roomTypes.map((value) => ({ value, label: t(`roomTypeNames.${value}`) }))}
              disabled={disabled}
            />
            <Picks
              control={control}
              name={at<Values>("weeklyDays")}
              legend={t("weeklyDays")}
              options={WEEKDAYS.map((value) => ({ value, label: t(`weekdays.${value}`) }))}
              disabled={disabled}
            />
            <Picks
              control={control}
              name={at<Values>("departureMonths")}
              legend={t("departureMonths")}
              hint={t("departureMonthsHint")}
              options={MONTHS.map((value) => ({ value, label: t(`months.${value}`) }))}
              disabled={disabled}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={control}
                name={at<Values>("seatsPerDeparture")}
                label={t("seatsPerDeparture")}
                inputMode="numeric"
                disabled={disabled}
              />
              <TextField control={control} name={at<Values>("startCity")} label={t("startCity")} disabled={disabled} />
              <MoneyField control={control} name={at<Values>("advancePerPerson")} label={t("advancePerPerson")} />
            </div>
            <Controller
              control={control}
              name={at<Values>("pricesIncludeGst")}
              render={({ field }) => (
                <Field orientation="horizontal" className="min-h-11">
                  <Switch
                    id={gstId}
                    checked={field.value === true}
                    disabled={disabled}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor={gstId} className="font-normal">
                    {t("pricesIncludeGst")}
                  </FieldLabel>
                </Field>
              )}
            />
            <NoteField
              control={control}
              name={at<Values>("paymentDetails")}
              label={t("paymentDetails")}
              hint={t("paymentDetailsHint")}
              disabled={disabled}
            />
            <NoteField
              control={control}
              name={at<Values>("pickupPoints")}
              label={t("pickupPoints")}
              hint={t("pickupPointsHint")}
              disabled={disabled}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
