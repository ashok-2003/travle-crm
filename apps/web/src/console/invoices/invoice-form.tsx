"use client";

// The invoice form, for a new invoice or a copy of one: type, who it is billed to, dates, the lines, GST and notes, with
// the totals as the api will make them. Checked by the api's own schema before it is sent; a refusal shows above the
// button, which is the dialog's (InvoiceDialog), sending this form by its id.
import { isGstStateCode } from "@travel-crm/contracts/kernel";
import { invoiceGstRates, type BillingDetails, type CreateInvoiceInput } from "@travel-crm/contracts/platform";
import { formatMoney, money } from "@travel-crm/domain/kernel";
import { MinusCircleIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, useWatch, type Control } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { FormField } from "@/components/form-field";
import { ChoiceField } from "@/components/forms/choice-field";
import { FormAlert } from "@/components/forms/form-dialog";
import { GstStateField } from "@/components/forms/gst-state-field";
import { MoneyField } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { NoteField } from "@/leads/form/note-field";
import {
  emptyLine,
  lineAmountPaise,
  MAX_LINES,
  previewAmounts,
  toCreateInvoiceInput,
  type InvoiceProblem,
  type InvoiceValues,
} from "./invoice-values";

const rate = (basisPoints: number) => `${String(basisPoints / 100)}%`;

/** A line's amount, quantity × rate, shown beside its fields as the person types. */
function LineAmount({ control, index }: { control: Control<InvoiceValues>; index: number }) {
  const t = useTranslations("consoleInvoices.invoiceForm");
  const line = useWatch({ control, name: `lines.${String(index)}` as `lines.${number}` });
  return (
    <FormField label={t("lineAmount")}>
      {({ id }) => (
        <output id={id} className="numbers flex min-h-11 items-center justify-end sm:min-w-28">
          {formatMoney(money(lineAmountPaise(line)))}
        </output>
      )}
    </FormField>
  );
}

function Totals({ control, billing }: { control: Control<InvoiceValues>; billing: BillingDetails }) {
  const t = useTranslations("consoleInvoices.invoiceForm");
  const [lines, gstRate, billToStateCode] = useWatch({ control, name: ["lines", "gstRate", "billToStateCode"] });
  const basisPoints = Number(gstRate);
  const sellerState = isGstStateCode(billing.stateCode) ? billing.stateCode : null;
  if (sellerState === null) return null;
  const sums = previewAmounts(
    lines,
    basisPoints,
    sellerState,
    isGstStateCode(billToStateCode) ? billToStateCode : null,
  );
  const rows = [
    { label: t("subtotal"), paise: sums.subtotalPaise },
    ...(basisPoints === 0
      ? []
      : sums.igstPaise > 0
        ? [{ label: t("igst", { rate: rate(basisPoints) }), paise: sums.igstPaise }]
        : [
            { label: t("cgst", { rate: rate(basisPoints / 2) }), paise: sums.cgstPaise },
            { label: t("sgst", { rate: rate(basisPoints / 2) }), paise: sums.sgstPaise },
          ]),
    { label: t("total"), paise: sums.totalPaise, strong: true },
  ];
  return (
    <section aria-label={t("totals")} className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className={cn("flex justify-between gap-4", row.strong && "font-semibold")}>
          <span>{row.label}</span>
          <span className="numbers">{formatMoney(money(row.paise))}</span>
        </div>
      ))}
    </section>
  );
}

export function InvoiceForm({
  id,
  billing,
  initial,
  send,
  sending,
}: {
  id: string;
  billing: BillingDetails;
  initial: InvoiceValues;
  send: (input: CreateInvoiceInput) => void;
  /** The save, whose refusal is shown above the dialog's button. */
  sending: { error: unknown };
}) {
  const t = useTranslations("consoleInvoices.invoiceForm");
  const { form, onSubmit, formProblem } = useCheckedForm<InvoiceValues, CreateInvoiceInput, InvoiceProblem>(
    initial,
    toCreateInvoiceInput,
    (problem) => t(`problems.${problem}`),
  );
  const { control } = form;
  const lines = useFieldArray({ control, name: "lines" });
  const canChargeGst = billing.gstin !== null;
  return (
    <form id={id} noValidate onSubmit={onSubmit(send)} className="flex flex-col gap-6">
      <FieldGroup>
        <ChoiceField
          control={control}
          name="kind"
          legend={t("kind")}
          inline
          options={[
            { value: "proforma", label: t("kinds.proforma") },
            { value: "invoice", label: t("kinds.invoice") },
          ]}
        />
        <FieldSet>
          <FieldLegend variant="label">{t("billedTo")}</FieldLegend>
          <TextField control={control} name="billToName" label={t("billToName")} autoComplete="off" />
          <NoteField control={control} name="billToAddress" label={t("billToAddress")} rows={2} />
          <div className="grid gap-5 sm:grid-cols-2">
            <GstStateField
              control={control}
              name="billToStateCode"
              label={t("billToState")}
              hint={t("billToStateHint")}
              placeholder={t("billToStatePlaceholder")}
            />
            <TextField
              control={control}
              name="billToGstin"
              label={t("billToGstin")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="[&_input]:numbers"
            />
          </div>
        </FieldSet>
        <div className="grid gap-5 sm:grid-cols-2">
          <DateField control={control} name="issuedOn" label={t("issuedOn")} />
          <DateField control={control} name="dueOn" label={t("dueOn")} />
        </div>
        <FieldSet>
          <FieldLegend variant="label">{t("linesLegend")}</FieldLegend>
          <FieldDescription>{t("linesHint")}</FieldDescription>
          {lines.fields.map((line, index) => (
            <div
              key={line.id}
              className="grid grid-cols-[1fr_1fr] gap-3 sm:grid-cols-[1fr_5rem_9rem_8rem_auto] sm:items-end"
            >
              <TextField
                control={control}
                name={`lines.${String(index)}.description` as `lines.${number}.description`}
                label={t("lineDescription")}
                autoComplete="off"
                className="col-span-2 sm:col-span-1"
              />
              <TextField
                control={control}
                name={`lines.${String(index)}.quantity` as `lines.${number}.quantity`}
                label={t("lineQuantity")}
                inputMode="numeric"
                autoComplete="off"
                inputClassName="numbers text-right"
              />
              <MoneyField
                control={control}
                name={`lines.${String(index)}.rate` as `lines.${number}.rate`}
                label={t("lineRate")}
              />
              <LineAmount control={control} index={index} />
              {lines.fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeLine", { number: index + 1 })}
                  onClick={() => {
                    lines.remove(index);
                  }}
                >
                  <MinusCircleIcon aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
          {lines.fields.length < MAX_LINES && (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => {
                lines.append({ ...emptyLine });
              }}
            >
              <PlusIcon aria-hidden="true" />
              {t("addLine")}
            </Button>
          )}
        </FieldSet>
        <SelectField
          control={control}
          name="gstRate"
          label={t("gstRate")}
          hint={canChargeGst ? undefined : t("gstNeedsGstin")}
          disabled={!canChargeGst}
          options={invoiceGstRates.map((basisPoints) => ({
            value: String(basisPoints),
            label: basisPoints === 0 ? t("gstNone") : rate(basisPoints),
          }))}
        />
        <NoteField control={control} name="notes" label={t("notes")} rows={4} />
        <Separator />
        <Totals control={control} billing={billing} />
      </FieldGroup>
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}
