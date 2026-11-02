"use client";

// /settings/quotes (step 3, P0): the agency's UPI id and the name customers see when they pay (money goes straight to
// the agency, never through us), the GST rate a new quote starts with, and the terms printed under every quote.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { saveQuoteSettingsInput, type QuoteSettings, type SaveQuoteSettingsInput } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { checked } from "@/components/forms/checked";
import { FormAlert } from "@/components/forms/form-dialog";
import { MoneyField, rupeesFieldText } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { NoteField } from "@/leads/form/note-field";
import { basisPointsOf, percentText } from "@/lib/percent";
import { useWriteAccess } from "@/subscription/write-access";
import { useQuoteSettings, useSaveQuoteSettings } from "./use-quotes";

interface Values {
  upiId: string;
  upiName: string;
  taxRate: string;
  terms: string;
  /** Percentages as typed: "10", "12.5"; empty for no minimum. */
  markup: string;
  minMargin: string;
  /** Rupees as typed; empty for no minimum. */
  minMarginPerPerson: string;
}
type Problem = "required" | "invalid" | "percent" | "amount";

function SettingsForm({ saved }: { saved: QuoteSettings }) {
  const t = useTranslations("quotes.settings");
  const access = useWriteAccess("change");
  const save = useSaveQuoteSettings();
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SaveQuoteSettingsInput, Problem>(
    {
      upiId: saved.upiId,
      upiName: saved.upiName,
      taxRate: String(saved.defaultTaxRateBasisPoints),
      terms: saved.defaultTerms,
      markup: percentText(saved.defaultMarkupBasisPoints),
      minMargin: saved.minMarginBasisPoints === null ? "" : percentText(saved.minMarginBasisPoints),
      minMarginPerPerson: saved.minMarginPerPersonPaise === null ? "" : rupeesFieldText(saved.minMarginPerPersonPaise),
    },
    (values) => {
      const markup = basisPointsOf(values.markup);
      const minMargin = values.minMargin.trim() === "" ? null : basisPointsOf(values.minMargin);
      const perPerson = values.minMarginPerPerson.trim() === "" ? null : paiseFromRupeesText(values.minMarginPerPerson);
      const found: Partial<Record<keyof Values, Problem>> = {};
      if (markup === null) found.markup = "percent";
      if (values.minMargin.trim() !== "" && minMargin === null) found.minMargin = "percent";
      if (values.minMarginPerPerson.trim() !== "" && perPerson === null) found.minMarginPerPerson = "amount";
      return checked(
        saveQuoteSettingsInput.safeParse({
          upiId: values.upiId,
          upiName: values.upiName,
          defaultTaxRateBasisPoints: Number(values.taxRate),
          defaultTerms: values.terms,
          defaultMarkupBasisPoints: markup ?? 0,
          minMarginBasisPoints: minMargin,
          minMarginPerPersonPaise: perPerson,
        }),
        values,
        (path) =>
          path[0] === "upiId" || path[0] === "upiName"
            ? path[0]
            : path[0] === "defaultTerms"
              ? "terms"
              : path[0] === "defaultTaxRateBasisPoints"
                ? "taxRate"
                : path[0] === "defaultMarkupBasisPoints"
                  ? "markup"
                  : path[0] === "minMarginBasisPoints"
                    ? "minMargin"
                    : path[0] === "minMarginPerPersonPaise"
                      ? "minMarginPerPerson"
                      : undefined,
        () => "invalid",
        found,
      );
    },
    (problem) => t(`problems.${problem}`),
  );
  return (
    <Card className="max-w-[720px]">
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={onSubmit((input) => {
            save.mutate(input, { onSuccess: () => toast.success(t("saved")) });
          })}
        >
          <TextField
            control={form.control}
            name="upiId"
            label={t("upiId")}
            hint={t("upiIdHint")}
            autoComplete="off"
            disabled={save.isPending}
          />
          <TextField
            control={form.control}
            name="upiName"
            label={t("upiName")}
            hint={t("upiNameHint")}
            disabled={save.isPending}
          />
          <SelectField
            control={form.control}
            name="taxRate"
            label={t("taxRate")}
            hint={t("taxRateHint")}
            disabled={save.isPending}
            options={[
              { value: "500", label: t("taxRates.500") },
              { value: "1800", label: t("taxRates.1800") },
              { value: "0", label: t("taxRates.0") },
            ]}
          />
          <fieldset className="flex flex-col gap-4">
            <legend className="font-semibold">{t("marginTitle")}</legend>
            <p className="text-muted-foreground">{t("marginIntro")}</p>
            <TextField
              control={form.control}
              name="markup"
              label={t("markup")}
              hint={t("markupHint")}
              inputMode="decimal"
              className="numbers"
              disabled={save.isPending}
            />
            <TextField
              control={form.control}
              name="minMargin"
              label={t("minMargin")}
              hint={t("minMarginHint")}
              inputMode="decimal"
              className="numbers"
              disabled={save.isPending}
            />
            <MoneyField
              control={form.control}
              name="minMarginPerPerson"
              label={t("minMarginPerPerson")}
              hint={t("minMarginPerPersonHint")}
            />
          </fieldset>
          <NoteField
            control={form.control}
            name="terms"
            label={t("terms")}
            hint={t("termsHint")}
            disabled={save.isPending}
          />
          <FormAlert sending={save} problem={formProblem} />
          <Button type="submit" className="self-start" disabled={save.isPending || !access.allowed}>
            {save.isPending && <Spinner aria-hidden="true" />}
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function QuoteSettingsScreen() {
  const t = useTranslations("quotes.settings");
  const settings = useQuoteSettings();
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {settings.data ? (
        <SettingsForm saved={settings.data} />
      ) : settings.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={settings.error}
          retryLabel={t("retry")}
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      )}
    </div>
  );
}
