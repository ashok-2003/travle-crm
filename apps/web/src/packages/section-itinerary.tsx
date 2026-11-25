"use client";

// Itinerary (/packages/<id>): the name staff know the trip by, the title a quote starts with, its destination, its
// nights and its day by day, summed up with Edit; the form saves only these (packages.updatePart). A destination named
// anew is added to the agency's list as the section is saved.
import {
  updatePackagePartInput,
  type PackageDetail,
  type QuoteDay,
  type UpdatePackagePartInput,
} from "@travel-crm/contracts/quotes";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, type Control } from "react-hook-form";
import { Details } from "@/components/details";
import { checked } from "@/components/forms/checked";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { DestinationField, type DestinationValue } from "@/leads/form/destination-field";
import { NoteField } from "@/leads/form/note-field";
import { PackageSection, SectionForm, useSectionSave } from "./package-section";

type Problem = "required" | "invalid";
interface Values {
  name: string;
  title: string;
  destination: DestinationValue | null;
  nights: string;
  days: QuoteDay[];
}

/** The form's field each of the input's fields belongs to; a refused day is the form's own problem (no field holds it). */
const fieldOf: Partial<Record<string, keyof Values>> = {
  name: "name",
  title: "title",
  destinationId: "destination",
  newDestinationName: "destination",
  nights: "nights",
};

function toInput(packageId: string, typed: Values) {
  const nights = typed.nights.trim();
  return updatePackagePartInput.safeParse({
    packageId,
    name: typed.name,
    title: typed.title,
    destinationId: typed.destination?.kind === "existing" ? typed.destination.destinationId : null,
    ...(typed.destination?.kind === "new" && { newDestinationName: typed.destination.name }),
    nights: nights === "" ? null : /^\d{1,2}$/.test(nights) ? Number(nights) : -1,
    days: typed.days.filter((day) => day.title.trim() !== ""),
  });
}

/** The day by day: a title and what happens, one item a day, added and removed in place. */
function DaysField({ control }: { control: Control<Values> }) {
  const t = useTranslations("packages.form");
  const days = useFieldArray({ control, name: "days" });
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">{t("days")}</h3>
      {days.fields.length === 0 ? (
        <p className="text-muted-foreground">{t("noDays")}</p>
      ) : (
        <ItemGroup className="gap-3">
          {days.fields.map((day, index) => (
            <Item key={day.id} variant="muted" role="listitem" className="items-start">
              <ItemContent className="gap-2">
                <TextField
                  control={control}
                  name={`days.${String(index)}.title` as `days.${number}.title`}
                  label={t("dayTitle", { day: index + 1 })}
                />
                <NoteField
                  control={control}
                  name={`days.${String(index)}.description` as `days.${number}.description`}
                  label={t("dayDescription")}
                />
              </ItemContent>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeDay", { day: index + 1 })}
                onClick={() => {
                  days.remove(index);
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </Item>
          ))}
        </ItemGroup>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            days.append({ title: "", description: "" });
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t("addDay")}
        </Button>
      </div>
    </div>
  );
}

function ItineraryEditor({ detail, close }: { detail: PackageDetail; close: () => void }) {
  const t = useTranslations("packages.form");
  const { updatePart, save } = useSectionSave("itinerary", close);
  const { form, onSubmit, formProblem } = useCheckedForm<Values, UpdatePackagePartInput, Problem>(
    {
      name: detail.name,
      title: detail.title,
      destination:
        detail.destinationId === null
          ? null
          : { kind: "existing", destinationId: detail.destinationId, name: detail.destinationName ?? "" },
      nights: detail.nights === null ? "" : String(detail.nights),
      days: detail.days,
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
  return (
    <SectionForm onSubmit={onSubmit(save)} sending={updatePart} problem={formProblem} onCancel={close}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label={t("name")} hint={t("nameHint")} />
        <TextField control={form.control} name="title" label={t("title")} hint={t("titleHint")} />
        <DestinationField
          control={form.control}
          name="destination"
          label={t("destination")}
          hint={t("destinationHint")}
          allowNew
        />
        <TextField
          control={form.control}
          name="nights"
          label={t("nights")}
          hint={t("nightsHint")}
          inputMode="numeric"
        />
      </div>
      <DaysField control={form.control} />
    </SectionForm>
  );
}

function ItinerarySummary({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.form");
  const tSections = useTranslations("packages.sections");
  const notSet = tSections("notSet");
  return (
    <Details
      rows={[
        { label: t("name"), value: detail.name },
        { label: t("title"), value: detail.title },
        { label: t("destination"), value: detail.destinationName ?? notSet },
        { label: t("nights"), value: detail.nights ?? notSet },
        {
          label: t("days"),
          value: tSections("itinerary.days", { count: detail.days.length }),
          ...(detail.days.length > 0 && { hint: detail.days.map((day) => day.title).join(" · ") }),
        },
      ]}
    />
  );
}

export function ItinerarySection({ detail }: { detail: PackageDetail }) {
  return (
    <PackageSection
      section="itinerary"
      summary={<ItinerarySummary detail={detail} />}
      editor={(close) => <ItineraryEditor detail={detail} close={close} />}
    />
  );
}
