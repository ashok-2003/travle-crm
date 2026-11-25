"use client";

// Trip details (/packages/<id>): the itinerary, what the trip includes and leaves out, pickup points with where it
// starts, notes and cancellation notes, summed up with Edit; one form saves them all (packages.updatePart). A line of
// the notes can be copied to other trips (copy-note-dialog.tsx).
import { updatePackagePartInput, type PackageDetail, type UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import { Details } from "@/components/details";
import { checked } from "@/components/forms/checked";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useTranslations } from "next-intl";
import { useHolds } from "@/session/me-context";
import { CopyNoteDialog } from "./copy-note-dialog";
import { PackageSection, SectionForm, useSectionSave } from "./package-section";
import { DetailsFields, useDetailsRows } from "./section-details";
import { ItineraryFields, useItineraryRows } from "./section-itinerary";
import {
  tripDetailsFieldOf,
  tripDetailsFields,
  tripDetailsValuesOf,
  type TripDetailsValues,
} from "./trip-details-values";

type Problem = "required" | "invalid";

function TripDetailsEditor({ detail, close }: { detail: PackageDetail; close: () => void }) {
  const t = useTranslations("packages.form");
  const { updatePart, save } = useSectionSave("details", close);
  const group = detail.kind === "group";
  const { form, onSubmit, formProblem } = useCheckedForm<TripDetailsValues, UpdatePackagePartInput, Problem>(
    tripDetailsValuesOf(detail),
    (typed) =>
      checked(
        updatePackagePartInput.safeParse({ packageId: detail.id, ...tripDetailsFields(typed, group) }),
        typed,
        (path) => tripDetailsFieldOf[String(path[0])],
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <SectionForm onSubmit={onSubmit(save)} sending={updatePart} problem={formProblem} onCancel={close}>
      <ItineraryFields control={form.control} />
      <DetailsFields control={form.control} group={group} />
    </SectionForm>
  );
}

function TripDetailsSummary({ detail }: { detail: PackageDetail }) {
  const itinerary = useItineraryRows(detail);
  const details = useDetailsRows(detail);
  const mayEdit = useHolds("quotes:edit");
  return (
    <>
      <Details rows={[...itinerary, ...details]} />
      {mayEdit && <CopyNoteDialog detail={detail} />}
    </>
  );
}

export function TripDetailsSection({ detail }: { detail: PackageDetail }) {
  return (
    <PackageSection
      section="details"
      summary={<TripDetailsSummary detail={detail} />}
      editor={(close) => <TripDetailsEditor detail={detail} close={close} />}
    />
  );
}
