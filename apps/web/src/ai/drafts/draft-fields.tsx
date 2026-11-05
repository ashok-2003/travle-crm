"use client";

// The drafted package's own fields in the review: each control with the line it was read from under it. Where the documents
// disagree (the departure days, the advance) the alternatives are offered and the field fills when one is chosen.
import type { PackageDraft } from "@travel-crm/contracts/ai";
import { roomTypes } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { Controller, useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { MoneyField, rupees, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { NoteField } from "@/leads/form/note-field";
import { MONTHS, Picks, WEEKDAYS } from "@/packages/group-fields";
import { AlternativesChoice, EvidenceNote, SoleEvidence } from "./draft-evidence";
import type { ReviewValues } from "./draft-values";

interface Props {
  draft: PackageDraft;
  control: Control<ReviewValues>;
  setValue: UseFormSetValue<ReviewValues>;
}

const Group = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-1">{children}</div>;

export function DraftFields({ draft, control, setValue }: Props) {
  const t = useTranslations("ai.drafts.fields");
  const form = useTranslations("packages.form");
  const gstId = useId();
  const weeklyChoice = useWatch({ control, name: "weeklyDaysChoice" });
  const advanceChoice = useWatch({ control, name: "advanceChoice" });
  const dayName = (day: number) => form(`weekdays.${String(day) as "0"}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Group>
          <TextField control={control} name="name" label={t("name")} />
          <EvidenceNote {...draft.name} />
        </Group>
        <Group>
          <TextField control={control} name="title" label={t("title")} />
          <EvidenceNote {...draft.title} />
        </Group>
        <Group>
          <TextField control={control} name="destination" label={t("destination")} />
          <EvidenceNote {...draft.destination} />
        </Group>
        <Group>
          <TextField control={control} name="nights" label={t("nights")} inputMode="numeric" />
          <EvidenceNote {...draft.nights} />
        </Group>
        <Group>
          <TextField control={control} name="startCity" label={t("startCity")} />
          <EvidenceNote {...draft.startCity} />
        </Group>
        <TextField control={control} name="seats" label={t("seats")} inputMode="numeric" hint={t("seatsHint")} />
      </div>
      <Group>
        <Picks
          control={control}
          name="roomTypes"
          legend={form("roomTypes")}
          disabled={false}
          options={roomTypes.map((value) => ({ value, label: form(`roomTypeNames.${value}`) }))}
        />
        <EvidenceNote {...draft.roomTypes} />
      </Group>
      {draft.weeklyDays.length > 1 && (
        <AlternativesChoice
          legend={t("weeklyDaysChoose")}
          chosen={weeklyChoice}
          alternatives={draft.weeklyDays.map((one) => ({
            shown: (one.value ?? []).map(dayName).join(", "),
            evidence: one.evidence,
            checkThis: one.checkThis,
          }))}
          onChoose={(index) => {
            setValue("weeklyDaysChoice", String(index));
            setValue("weeklyDays", (draft.weeklyDays[index]?.value ?? []).map(String));
          }}
        />
      )}
      <Group>
        <Picks
          control={control}
          name="weeklyDays"
          legend={form("weeklyDays")}
          disabled={false}
          options={WEEKDAYS.map((value) => ({ value, label: form(`weekdays.${value}`) }))}
        />
        <SoleEvidence alternatives={draft.weeklyDays} />
      </Group>
      <Group>
        <Picks
          control={control}
          name="departureMonths"
          legend={form("departureMonths")}
          disabled={false}
          options={MONTHS.map((value) => ({ value, label: form(`months.${value}`) }))}
        />
        <EvidenceNote {...draft.departureMonths} />
      </Group>
      {draft.advancePerPersonPaise.length > 1 && (
        <AlternativesChoice
          legend={t("advanceChoose")}
          chosen={advanceChoice}
          alternatives={draft.advancePerPersonPaise.map((one) => ({
            shown: one.value === null ? "" : rupees(one.value),
            evidence: one.evidence,
            checkThis: one.checkThis,
          }))}
          onChoose={(index) => {
            const paise = draft.advancePerPersonPaise[index]?.value ?? null;
            setValue("advanceChoice", String(index));
            setValue("advance", paise === null ? "" : rupeesFieldText(paise));
          }}
        />
      )}
      <Group>
        <MoneyField control={control} name="advance" label={t("advance")} />
        <SoleEvidence alternatives={draft.advancePerPersonPaise} />
      </Group>
      <Group>
        <Controller
          control={control}
          name="pricesIncludeGst"
          render={({ field }) => (
            <Field orientation="horizontal" className="min-h-11">
              <Switch id={gstId} checked={field.value} onCheckedChange={field.onChange} />
              <FieldLabel htmlFor={gstId} className="font-normal">
                {form("pricesIncludeGst")}
              </FieldLabel>
            </Field>
          )}
        />
        <EvidenceNote {...draft.pricesIncludeGst} />
      </Group>
      <Group>
        <NoteField control={control} name="pickupPoints" label={t("pickupPoints")} />
        <EvidenceNote {...draft.pickupPoints} />
      </Group>
      <Group>
        <NoteField control={control} name="summary" label={t("summary")} />
        <EvidenceNote {...draft.summary} />
      </Group>
      <Group>
        <NoteField control={control} name="highlights" label={t("highlights")} hint={t("highlightsHint")} />
        <EvidenceNote {...draft.highlights} />
      </Group>
      <Group>
        <NoteField control={control} name="inclusions" label={t("inclusions")} />
        <EvidenceNote {...draft.inclusions} />
      </Group>
      <Group>
        <NoteField control={control} name="exclusions" label={t("exclusions")} />
        <EvidenceNote {...draft.exclusions} />
      </Group>
      <Group>
        <NoteField control={control} name="cancellationNotes" label={t("cancellationNotes")} />
        <EvidenceNote {...draft.cancellationNotes} />
      </Group>
    </div>
  );
}
