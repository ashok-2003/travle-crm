"use client";

// Details & rules (/packages/<id>): what the trip includes and leaves out, its notes and cancellation notes (printed on a
// quote made from it), what travellers fill in for a booking and, for a group trip, its pickup points and whether its
// prices include GST. Summed up with Edit; the form saves only these (packages.updatePart). A line of the notes can be
// copied to other trips (copy-note-dialog.tsx).
import { travellerLevels } from "@travel-crm/contracts/bookings";
import { updatePackagePartInput, type PackageDetail, type UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { Controller } from "react-hook-form";
import { Details } from "@/components/details";
import { checked } from "@/components/forms/checked";
import { SelectField } from "@/components/forms/select-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { NoteField } from "@/leads/form/note-field";
import { useHolds } from "@/session/me-context";
import { CopyNoteDialog } from "./copy-note-dialog";
import { PackageSection, SectionForm, useSectionSave } from "./package-section";

/** The agency's usual level: the trip sets none of its own. */
const DEFAULT_LEVEL = "default";
type Problem = "required" | "invalid";
interface Values {
  inclusions: string;
  exclusions: string;
  pickupPoints: string;
  notes: string;
  cancellationNotes: string;
  level: string;
  pricesIncludeGst: boolean;
}

const fieldOf: Partial<Record<string, keyof Values>> = {
  inclusions: "inclusions",
  exclusions: "exclusions",
  pickupPoints: "pickupPoints",
  notes: "notes",
  cancellationNotes: "cancellationNotes",
  defaultTravellerLevel: "level",
  pricesIncludeGst: "pricesIncludeGst",
};

function toInput(packageId: string, typed: Values) {
  return updatePackagePartInput.safeParse({
    packageId,
    inclusions: typed.inclusions,
    exclusions: typed.exclusions,
    pickupPoints: typed.pickupPoints,
    notes: typed.notes,
    cancellationNotes: typed.cancellationNotes,
    defaultTravellerLevel: typed.level === DEFAULT_LEVEL ? null : typed.level,
    pricesIncludeGst: typed.pricesIncludeGst,
  });
}

function DetailsEditor({ detail, close }: { detail: PackageDetail; close: () => void }) {
  const t = useTranslations("packages.form");
  const gstId = useId();
  const { updatePart, save } = useSectionSave("details", close);
  const { form, onSubmit, formProblem } = useCheckedForm<Values, UpdatePackagePartInput, Problem>(
    {
      inclusions: detail.inclusions,
      exclusions: detail.exclusions,
      pickupPoints: detail.pickupPoints,
      notes: detail.notes,
      cancellationNotes: detail.cancellationNotes,
      level: detail.defaultTravellerLevel ?? DEFAULT_LEVEL,
      pricesIncludeGst: detail.pricesIncludeGst,
    },
    (typed) =>
      checked(
        toInput(detail.id, typed),
        typed,
        (path) => fieldOf[String(path[0])],
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const group = detail.kind === "group";
  return (
    <SectionForm onSubmit={onSubmit(save)} sending={updatePart} problem={formProblem} onCancel={close}>
      <NoteField control={form.control} name="inclusions" label={t("inclusions")} />
      <NoteField control={form.control} name="exclusions" label={t("exclusions")} />
      {group && (
        <NoteField control={form.control} name="pickupPoints" label={t("pickupPoints")} hint={t("pickupPointsHint")} />
      )}
      <NoteField control={form.control} name="notes" label={t("notes")} hint={t("notesHint")} />
      <NoteField
        control={form.control}
        name="cancellationNotes"
        label={t("cancellationNotes")}
        hint={t("cancellationNotesHint")}
      />
      <SelectField
        control={form.control}
        name="level"
        label={t("level")}
        hint={t("levelHint")}
        options={[
          { value: DEFAULT_LEVEL, label: t("levelDefault") },
          ...travellerLevels.map((level) => ({ value: level, label: t(`levels.${level}`) })),
        ]}
      />
      {group && (
        <Controller
          control={form.control}
          name="pricesIncludeGst"
          render={({ field }) => (
            <Field orientation="horizontal" className="min-h-11">
              <Switch id={gstId} checked={field.value} onCheckedChange={field.onChange} />
              <FieldLabel htmlFor={gstId} className="font-normal">
                {t("pricesIncludeGst")}
              </FieldLabel>
            </Field>
          )}
        />
      )}
    </SectionForm>
  );
}

function DetailsSummary({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.form");
  const tSections = useTranslations("packages.sections");
  /** Long words cut to two lines: the whole of them is in the form. */
  const words = (text: string): ReactNode =>
    text.trim() === "" ? tSections("notSet") : <span className="line-clamp-2 whitespace-pre-line">{text}</span>;
  const group = detail.kind === "group";
  const mayEdit = useHolds("quotes:edit");
  return (
    <>
      <Details
        rows={[
          { label: t("inclusions"), value: words(detail.inclusions) },
          { label: t("exclusions"), value: words(detail.exclusions) },
          ...(group ? [{ label: t("pickupPoints"), value: words(detail.pickupPoints) }] : []),
          { label: t("notes"), value: words(detail.notes) },
          { label: t("cancellationNotes"), value: words(detail.cancellationNotes) },
          {
            label: t("level"),
            value:
              detail.defaultTravellerLevel === null ? t("levelDefault") : t(`levels.${detail.defaultTravellerLevel}`),
          },
          ...(group
            ? [{ label: t("pricesIncludeGst"), value: tSections(detail.pricesIncludeGst ? "yes" : "no") }]
            : []),
        ]}
      />
      {mayEdit && <CopyNoteDialog detail={detail} />}
    </>
  );
}

export function DetailsSection({ detail }: { detail: PackageDetail }) {
  return (
    <PackageSection
      section="details"
      summary={<DetailsSummary detail={detail} />}
      editor={(close) => <DetailsEditor detail={detail} close={close} />}
    />
  );
}
