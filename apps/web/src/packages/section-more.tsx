"use client";

// More (/packages/<id>), closed until opened: what is rarely changed, the page's address, the title a quote starts
// with, what travellers fill in for a booking and, for a group trip, whether its prices include GST. Saved alone
// (packages.updatePart); without quotes:edit the same facts are only to read.
import { travellerLevels } from "@travel-crm/contracts/bookings";
import {
  packageKinds,
  updatePackagePartInput,
  type PackageDetail,
  type PackageKind,
  type UpdatePackagePartInput,
} from "@travel-crm/contracts/quotes";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { Details } from "@/components/details";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useHolds } from "@/session/me-context";
import { sectionAnchors, SectionForm, useSectionSave } from "./package-section";

/** An address from a name: lower-case words joined by hyphens ("Kedarnath Yatra" is "kedarnath-yatra"). */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** The agency's usual level: the trip sets none of its own. */
const DEFAULT_LEVEL = "default";
type Problem = "required" | "invalid" | "slug";
interface Values {
  kind: PackageKind;
  slug: string;
  title: string;
  level: string;
  pricesIncludeGst: boolean;
}

const fieldOf: Partial<Record<string, keyof Values>> = {
  kind: "kind",
  slug: "slug",
  title: "title",
  defaultTravellerLevel: "level",
  pricesIncludeGst: "pricesIncludeGst",
};

function toInput(packageId: string, typed: Values) {
  const group = typed.kind === "group";
  return updatePackagePartInput.safeParse({
    packageId,
    kind: typed.kind,
    slug: typed.slug.trim() === "" ? null : typed.slug.trim(),
    title: typed.title,
    defaultTravellerLevel: typed.level === DEFAULT_LEVEL ? null : typed.level,
    ...(group && { pricesIncludeGst: typed.pricesIncludeGst }),
  });
}

function MoreEditor({ detail, close }: { detail: PackageDetail; close: () => void }) {
  const t = useTranslations("packages.form");
  const gstId = useId();
  const { updatePart, save } = useSectionSave("more", () => undefined);
  const { form, onSubmit, formProblem } = useCheckedForm<Values, UpdatePackagePartInput, Problem>(
    {
      kind: detail.kind,
      slug: detail.slug ?? slugOf(detail.name),
      title: detail.title,
      level: detail.defaultTravellerLevel ?? DEFAULT_LEVEL,
      pricesIncludeGst: detail.pricesIncludeGst,
    },
    (typed) =>
      checked(
        toInput(detail.id, typed),
        typed,
        (path) => fieldOf[String(path[0])],
        (field) => (field === "slug" ? "slug" : "invalid"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  const group = useWatch({ control: form.control, name: "kind" }) === "group";
  return (
    <SectionForm onSubmit={onSubmit(save)} sending={updatePart} problem={formProblem} onCancel={close}>
      <ChoiceField
        control={form.control}
        name="kind"
        legend={t("kind")}
        options={packageKinds.map((value) => ({ value, label: t(`kinds.${value}`) }))}
      />
      <TextField
        control={form.control}
        name="slug"
        label={t("slug")}
        hint={t("slugHint", { code: detail.agencyCode })}
        autoCapitalize="none"
        spellCheck={false}
      />
      <TextField control={form.control} name="title" label={t("title")} hint={t("titleHint")} />
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

function MoreSummary({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.form");
  const tSections = useTranslations("packages.sections");
  return (
    <Details
      rows={[
        { label: t("kind"), value: t(`kinds.${detail.kind}`) },
        {
          label: t("slug"),
          value: detail.slug === null ? tSections("notSet") : `/a/${detail.agencyCode}/${detail.slug}`,
        },
        { label: t("title"), value: detail.title },
        {
          label: t("level"),
          value:
            detail.defaultTravellerLevel === null ? t("levelDefault") : t(`levels.${detail.defaultTravellerLevel}`),
        },
        ...(detail.kind === "group"
          ? [{ label: t("pricesIncludeGst"), value: tSections(detail.pricesIncludeGst ? "yes" : "no") }]
          : []),
      ]}
    />
  );
}

export function MoreSection({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.sections");
  const mayEdit = useHolds("quotes:edit");
  const [open, setOpen] = useState(false);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <Card id={sectionAnchors.more} className="scroll-mt-6">
        <CardHeader>
          <CardTitle>
            <h2>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="-ml-3 text-section font-semibold">
                  {t("more.title")}
                  <ChevronDownIcon aria-hidden="true" className={open ? "rotate-180" : ""} />
                </Button>
              </CollapsibleTrigger>
            </h2>
          </CardTitle>
        </CardHeader>
        <CollapsibleContent asChild>
          <CardContent>
            {mayEdit ? (
              <MoreEditor
                detail={detail}
                close={() => {
                  setOpen(false);
                }}
              />
            ) : (
              <MoreSummary detail={detail} />
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
