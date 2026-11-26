"use client";

// The other half of Trip details (/packages/<id>): what the trip includes and leaves out, its pickup points with where
// it starts (a group trip), its notes and its cancellation notes (printed on a quote made from it). The form and its
// save are section-trip-details.tsx's.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Control } from "react-hook-form";
import type { Detail } from "@/components/details";
import { TextField } from "@/components/forms/text-field";
import { NoteField } from "@/leads/form/note-field";
import type { TripDetailsValues } from "./trip-details-values";

export function DetailsFields({ control, group }: { control: Control<TripDetailsValues>; group: boolean }) {
  const t = useTranslations("packages.form");
  return (
    <>
      <NoteField control={control} name="inclusions" label={t("inclusions")} />
      <NoteField control={control} name="exclusions" label={t("exclusions")} />
      {group && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NoteField control={control} name="pickupPoints" label={t("pickupPoints")} hint={t("pickupPointsHint")} />
          <TextField control={control} name="startCity" label={t("startCity")} />
        </div>
      )}
      <NoteField control={control} name="notes" label={t("notes")} hint={t("notesHint")} />
      <NoteField
        control={control}
        name="cancellationNotes"
        label={t("cancellationNotes")}
        hint={t("cancellationNotesHint")}
      />
    </>
  );
}

/** The rows of Trip details' summary that are not the itinerary's. Free text is stacked under its label, whole. */
export function useDetailsRows(detail: PackageDetail): Detail[] {
  const t = useTranslations("packages.form");
  const notSet = useTranslations("packages.sections")("notSet");
  const words = (text: string): ReactNode =>
    text.trim() === "" ? notSet : <span className="whitespace-pre-line">{text}</span>;
  return [
    { label: t("inclusions"), value: words(detail.inclusions), stacked: true },
    { label: t("exclusions"), value: words(detail.exclusions), stacked: true },
    ...(detail.kind === "group"
      ? [
          { label: t("pickupPoints"), value: words(detail.pickupPoints), stacked: true },
          { label: t("startCity"), value: detail.startCity || notSet },
        ]
      : []),
    { label: t("notes"), value: words(detail.notes), stacked: true },
    { label: t("cancellationNotes"), value: words(detail.cancellationNotes), stacked: true },
  ];
}
