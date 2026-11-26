"use client";

// The other half of Trip details (/packages/<id>): what the trip includes and leaves out, its pickup points with where
// it starts (a group trip), its notes and its cancellation notes (printed on a quote made from it). The form and its
// save are section-trip-details.tsx's.
import { pointsOf, type PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Control } from "react-hook-form";
import type { Detail } from "@/components/details";
import { TextField } from "@/components/forms/text-field";
import { cardTints } from "@/components/card-tints";
import { DayBoxes } from "@/components/trip-plan/day-boxes";
import { PointList } from "@/components/trip-plan/point-list";
import { cn } from "@/lib/utils";
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

/** The rows of Trip details' summary that are not the itinerary's: where a group trip starts. */
export function useDetailsRows(detail: PackageDetail): Detail[] {
  const t = useTranslations("packages.form");
  const notSet = useTranslations("packages.sections")("notSet");
  return detail.kind === "group" ? [{ label: t("startCity"), value: detail.startCity || notSet }] : [];
}

/** The plan's parts as Trip details reads them: the days as boxes, then what is in, what is not, pickups and notes. */
export function TripPlanRead({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.form");
  const notSet = useTranslations("packages.sections")("notSet");
  const part = (label: string, body: ReactNode, empty: boolean, tint = false) => (
    <section key={label} className="flex flex-col gap-2">
      <h3 className="font-medium">{label}</h3>
      {empty ? (
        <p className="text-muted-foreground">{notSet}</p>
      ) : (
        <div className={tint ? cn("rounded-lg p-4", cardTints.good) : undefined}>{body}</div>
      )}
    </section>
  );
  const points = (label: string, text: string, tone: "included" | "excluded" | "plain") =>
    part(label, <PointList text={text} tone={tone} />, pointsOf(text).length === 0, tone === "included");
  return (
    <div className="flex flex-col gap-4 px-3">
      {part(t("days"), <DayBoxes days={detail.days} />, detail.days.length === 0)}
      {points(t("inclusions"), detail.inclusions, "included")}
      {points(t("exclusions"), detail.exclusions, "excluded")}
      {detail.kind === "group" && points(t("pickupPoints"), detail.pickupPoints, "plain")}
      {points(t("notes"), detail.notes, "plain")}
      {points(t("cancellationNotes"), detail.cancellationNotes, "plain")}
    </div>
  );
}
