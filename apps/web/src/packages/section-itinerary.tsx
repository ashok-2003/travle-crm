"use client";

// The itinerary half of Trip details (/packages/<id>): the name staff know the trip by, its destination, nights and day
// by day, each day movable up and down. The form and its save are section-trip-details.tsx's; a destination named anew
// is added to the agency's list as the section is saved.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, type Control } from "react-hook-form";
import type { Detail } from "@/components/details";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemGroup } from "@/components/ui/item";
import { DestinationField } from "@/leads/form/destination-field";
import { NoteField } from "@/leads/form/note-field";
import type { TripDetailsValues } from "./trip-details-values";

/** The day by day: a title and what happens, one item a day, moved, added and removed in place. */
function DaysField({ control }: { control: Control<TripDetailsValues> }) {
  const t = useTranslations("packages.form");
  const days = useFieldArray({ control, name: "days" });
  const last = days.fields.length - 1;
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
              <ItemActions>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("moveUp", { day: index + 1 })}
                  disabled={index === 0}
                  onClick={() => {
                    days.move(index, index - 1);
                  }}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("moveDown", { day: index + 1 })}
                  disabled={index === last}
                  onClick={() => {
                    days.move(index, index + 1);
                  }}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
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
              </ItemActions>
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

export function ItineraryFields({ control }: { control: Control<TripDetailsValues> }) {
  const t = useTranslations("packages.form");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={control} name="name" label={t("name")} hint={t("nameHint")} />
        <DestinationField
          control={control}
          name="destination"
          label={t("destination")}
          hint={t("destinationHint")}
          allowNew
        />
        <TextField control={control} name="nights" label={t("nights")} hint={t("nightsHint")} inputMode="numeric" />
      </div>
      <DaysField control={control} />
    </>
  );
}

/** The itinerary's rows of Trip details' summary; its days are the plan's (section-details.tsx). */
export function useItineraryRows(detail: PackageDetail): Detail[] {
  const t = useTranslations("packages.form");
  const notSet = useTranslations("packages.sections")("notSet");
  return [
    { label: t("name"), value: detail.name },
    { label: t("destination"), value: detail.destinationName ?? notSet },
    { label: t("nights"), value: detail.nights ?? notSet },
  ];
}
