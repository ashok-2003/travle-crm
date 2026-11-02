"use client";

// A package's words and price (release 7b): the name staff know it by, what a quote starts with (title, day by day,
// inclusions, exclusions), and what its public page says (address, summary, highlights, the price shown, cancellation notes).
// One form; the tiers, photos and publishing are cards beside it.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { travellerLevels } from "@travel-crm/contracts/bookings";
import { updatePackageInput, type PackageDetail, type UpdatePackageInput } from "@travel-crm/contracts/quotes";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray } from "react-hook-form";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { FormAlert } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { DestinationField, type DestinationValue } from "@/leads/form/destination-field";
import { NoteField } from "@/leads/form/note-field";
import { useWriteAccess } from "@/subscription/write-access";
import { CalculateFromButton } from "./calculate-from-button";
import { usePackageChanges } from "./use-packages";

type Problem = "required" | "invalid" | "slug" | "price";
interface Values {
  name: string;
  title: string;
  slug: string;
  destination: DestinationValue | null;
  nights: string;
  summary: string;
  /** One highlight a line. */
  highlights: string;
  priceDisplay: string;
  fromPrice: string;
  level: string;
  cancellationNotes: string;
  inclusions: string;
  exclusions: string;
  notes: string;
  days: { title: string; description: string }[];
}

/** An address from a name: lower-case words joined by hyphens ("Kedarnath Yatra" is "kedarnath-yatra"). */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

const DEFAULT_LEVEL = "default";
const fields = [
  "name",
  "title",
  "slug",
  "nights",
  "summary",
  "highlights",
  "priceDisplay",
  "cancellationNotes",
  "inclusions",
  "exclusions",
  "notes",
  "days",
] as const;
const renamed: Partial<Record<string, keyof Values>> = {
  destinationId: "destination",
  fromPricePaise: "fromPrice",
  defaultTravellerLevel: "level",
};

function toInput(packageId: string, detail: PackageDetail, typed: Values) {
  const price = typed.fromPrice.trim() === "" ? null : (paiseFromRupeesText(typed.fromPrice) ?? -1);
  const nights = typed.nights.trim() === "" ? null : /^\d{1,2}$/.test(typed.nights.trim()) ? Number(typed.nights) : -1;
  return updatePackageInput.safeParse({
    packageId,
    name: typed.name,
    title: typed.title,
    days: typed.days.filter((day) => day.title.trim() !== ""),
    inclusions: typed.inclusions,
    exclusions: typed.exclusions,
    notes: typed.notes,
    taxRateBasisPoints: detail.taxRateBasisPoints,
    slug: typed.slug.trim() === "" ? null : typed.slug.trim(),
    destinationId: typed.destination?.kind === "existing" ? typed.destination.destinationId : null,
    nights,
    summary: typed.summary,
    highlights: typed.highlights
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
    priceDisplay: typed.priceDisplay,
    fromPricePaise: price,
    defaultTravellerLevel: typed.level === DEFAULT_LEVEL ? null : typed.level,
    cancellationNotes: typed.cancellationNotes,
  });
}

function valuesOf(detail: PackageDetail): Values {
  return {
    name: detail.name,
    title: detail.title,
    slug: detail.slug ?? slugOf(detail.name),
    destination:
      detail.destinationId === null
        ? null
        : { kind: "existing", destinationId: detail.destinationId, name: detail.destinationName ?? "" },
    nights: detail.nights === null ? "" : String(detail.nights),
    summary: detail.summary,
    highlights: detail.highlights.join("\n"),
    priceDisplay: detail.priceDisplay,
    fromPrice: detail.fromPricePaise === null ? "" : rupeesFieldText(detail.fromPricePaise),
    level: detail.defaultTravellerLevel ?? DEFAULT_LEVEL,
    cancellationNotes: detail.cancellationNotes,
    inclusions: detail.inclusions,
    exclusions: detail.exclusions,
    notes: detail.notes,
    days: detail.days,
  };
}

/** What identifies the form's saved values, so it starts afresh after a save but not when only a photo or a tier changed. */
export const savedKey = (detail: PackageDetail) => JSON.stringify(valuesOf(detail));

export function PackageForm({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.form");
  const access = useWriteAccess("change");
  const { update } = usePackageChanges();
  const values = valuesOf(detail);
  const { form, onSubmit, formProblem } = useCheckedForm<Values, UpdatePackageInput, Problem>(
    values,
    (typed) =>
      checked(
        toInput(detail.id, detail, typed),
        typed,
        (path) => {
          const key = String(path[0]);
          return renamed[key] ?? fields.find((field) => field === key);
        },
        (field) => (field === "slug" ? "slug" : field === "fromPrice" ? "price" : "invalid"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  const days = useFieldArray({ control: form.control, name: "days" });
  const busy = update.isPending || !access.allowed;
  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={onSubmit((input) => {
        update.mutate(input);
      })}
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("quoteTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="name" label={t("name")} hint={t("nameHint")} disabled={busy} />
          <TextField control={form.control} name="title" label={t("title")} hint={t("titleHint")} disabled={busy} />
          <DestinationField
            control={form.control}
            name="destination"
            label={t("destination")}
            hint={t("destinationHint")}
          />
          <TextField
            control={form.control}
            name="nights"
            label={t("nights")}
            hint={t("nightsHint")}
            inputMode="numeric"
            disabled={busy}
          />
          <div className="sm:col-span-2">
            <SelectField
              control={form.control}
              name="level"
              label={t("level")}
              hint={t("levelHint")}
              disabled={busy}
              options={[
                { value: DEFAULT_LEVEL, label: t("levelDefault") },
                ...travellerLevels.map((level) => ({ value: level, label: t(`levels.${level}`) })),
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <NoteField control={form.control} name="inclusions" label={t("inclusions")} disabled={busy} />
          </div>
          <div className="sm:col-span-2">
            <NoteField control={form.control} name="exclusions" label={t("exclusions")} disabled={busy} />
          </div>
          <div className="sm:col-span-2">
            <NoteField control={form.control} name="notes" label={t("notes")} hint={t("notesHint")} disabled={busy} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("days")}</h2>
          </CardTitle>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                days.append({ title: "", description: "" });
              }}
            >
              <PlusIcon aria-hidden="true" />
              {t("addDay")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {days.fields.length === 0 ? (
            <p className="text-muted-foreground">{t("noDays")}</p>
          ) : (
            <ItemGroup className="gap-3">
              {days.fields.map((day, index) => (
                <Item key={day.id} variant="muted" role="listitem" className="items-start">
                  <ItemContent className="gap-2">
                    <TextField
                      control={form.control}
                      name={`days.${String(index)}.title` as `days.${number}.title`}
                      label={t("dayTitle", { day: index + 1 })}
                      disabled={busy}
                    />
                    <NoteField
                      control={form.control}
                      name={`days.${String(index)}.description` as `days.${number}.description`}
                      label={t("dayDescription")}
                      disabled={busy}
                    />
                  </ItemContent>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeDay", { day: index + 1 })}
                    disabled={busy}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("pageTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TextField
            control={form.control}
            name="slug"
            label={t("slug")}
            hint={t("slugHint", { code: detail.agencyCode })}
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
          />
          <NoteField
            control={form.control}
            name="summary"
            label={t("summary")}
            hint={t("summaryHint")}
            disabled={busy}
          />
          <NoteField
            control={form.control}
            name="highlights"
            label={t("highlights")}
            hint={t("highlightsHint")}
            disabled={busy}
          />
          <ChoiceField
            control={form.control}
            name="priceDisplay"
            legend={t("priceDisplay")}
            options={[
              { value: "from", label: t("priceFrom") },
              { value: "on_enquiry", label: t("priceOnEnquiry") },
            ]}
          />
          <div className="flex flex-col gap-2">
            <MoneyField control={form.control} name="fromPrice" label={t("fromPrice")} hint={t("fromPriceHint")} />
            <CalculateFromButton
              packageId={detail.id}
              onSuggested={(paise) => {
                form.setValue("fromPrice", rupeesFieldText(paise), { shouldDirty: true });
              }}
            />
          </div>
          <NoteField
            control={form.control}
            name="cancellationNotes"
            label={t("cancellationNotes")}
            hint={t("cancellationNotesHint")}
            disabled={busy}
          />
        </CardContent>
      </Card>

      <FormAlert sending={update} problem={formProblem} />
      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {update.isPending && <Spinner aria-hidden="true" />}
          {update.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
