"use client";

// Page & files (/packages/<id>): what the trip's public page says (its address, summary, highlights and the price
// visitors see), summed up with Edit; the form saves only these (packages.updatePart). Then publishing, the AI-sell
// switch, photos, brochures and, for a group trip, its tiers (a custom trip's sit with its prices).
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { updatePackagePartInput, type PackageDetail, type UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { MoneyField, rupees, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { NoteField } from "@/leads/form/note-field";
import { CalculateFromButton } from "./calculate-from-button";
import { PackageFilesCard } from "./package-files-card";
import { PackagePhotos } from "./package-photos";
import { PackageSection, SectionForm, useSectionSave } from "./package-section";
import { PublishCard } from "./publish-card";
import { SellCard } from "./sell-card";
import { TiersCard } from "./tiers-card";

/** An address from a name: lower-case words joined by hyphens ("Kedarnath Yatra" is "kedarnath-yatra"). */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

type Problem = "required" | "invalid" | "slug" | "price";
interface Values {
  slug: string;
  summary: string;
  /** One highlight a line. */
  highlights: string;
  priceDisplay: string;
  fromPrice: string;
}

const fieldOf: Partial<Record<string, keyof Values>> = {
  slug: "slug",
  summary: "summary",
  highlights: "highlights",
  priceDisplay: "priceDisplay",
  fromPricePaise: "fromPrice",
};

function toInput(packageId: string, typed: Values) {
  const price = typed.fromPrice.trim();
  return updatePackagePartInput.safeParse({
    packageId,
    slug: typed.slug.trim() === "" ? null : typed.slug.trim(),
    summary: typed.summary,
    highlights: typed.highlights
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
    priceDisplay: typed.priceDisplay,
    fromPricePaise: price === "" ? null : (paiseFromRupeesText(price) ?? -1),
  });
}

function PageEditor({ detail, close }: { detail: PackageDetail; close: () => void }) {
  const t = useTranslations("packages.form");
  const { updatePart, save } = useSectionSave("page", close);
  const { form, onSubmit, formProblem } = useCheckedForm<Values, UpdatePackagePartInput, Problem>(
    {
      slug: detail.slug ?? slugOf(detail.name),
      summary: detail.summary,
      highlights: detail.highlights.join("\n"),
      priceDisplay: detail.priceDisplay,
      fromPrice: detail.fromPricePaise === null ? "" : rupeesFieldText(detail.fromPricePaise),
    },
    (typed) =>
      checked(
        toInput(detail.id, typed),
        typed,
        (path) => fieldOf[String(path[0])],
        (field) => (field === "slug" ? "slug" : field === "fromPrice" ? "price" : "invalid"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <SectionForm onSubmit={onSubmit(save)} sending={updatePart} problem={formProblem} onCancel={close}>
      <TextField
        control={form.control}
        name="slug"
        label={t("slug")}
        hint={t("slugHint", { code: detail.agencyCode })}
        autoCapitalize="none"
        spellCheck={false}
      />
      <NoteField control={form.control} name="summary" label={t("summary")} hint={t("summaryHint")} />
      <NoteField control={form.control} name="highlights" label={t("highlights")} hint={t("highlightsHint")} />
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
    </SectionForm>
  );
}

function PageSummary({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.form");
  const tSections = useTranslations("packages.sections");
  const tHeader = useTranslations("packages.header");
  const notSet = tSections("notSet");
  const price =
    detail.priceDisplay === "on_enquiry"
      ? t("priceOnEnquiry")
      : detail.fromPricePaise === null
        ? t("priceFrom")
        : tHeader("fromPrice", { price: rupees(detail.fromPricePaise) });
  return (
    <Details
      rows={[
        { label: t("slug"), value: detail.slug === null ? notSet : `/a/${detail.agencyCode}/${detail.slug}` },
        {
          label: t("summary"),
          value: detail.summary === "" ? notSet : <span className="line-clamp-2">{detail.summary}</span>,
        },
        { label: t("highlights"), value: detail.highlights.join(" · ") || notSet },
        { label: t("priceDisplay"), value: price },
        { label: tSections("page.photos"), value: detail.photoCount },
      ]}
    />
  );
}

export function PageSection({ detail }: { detail: PackageDetail }) {
  return (
    <PackageSection
      section="page"
      summary={<PageSummary detail={detail} />}
      editor={(close) => <PageEditor detail={detail} close={close} />}
    >
      <PublishCard detail={detail} />
      <SellCard detail={detail} />
      <PackagePhotos packageId={detail.id} />
      <PackageFilesCard packageId={detail.id} />
      {detail.kind === "group" && <TiersCard detail={detail} />}
    </PackageSection>
  );
}
