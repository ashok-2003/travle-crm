"use client";

// Writing a quote (step 3, P0): the trip (title, start, travellers), its plan a day at a time, the priced lines (what,
// how many, the price of one), the GST rate, inclusions, exclusions and notes. Days and lines are added and removed in
// place. The totals shown are a preview; the api works them out again on save, with GST split CGST and SGST.
import { AiMark } from "@/ai/fill/ai-mark";
import { quoteConverter } from "@/ai/fill/fill-converters";
import { FillWithAi } from "@/ai/fill/fill-with-ai";
import { FillMarksProvider, useFillMarks } from "@/ai/fill/use-fill-marks";
import { gstStates, paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { QuoteDetail, UpdateQuoteInput } from "@travel-crm/contracts/quotes";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { FormField } from "@/components/form-field";
import { rupees, rupeesFieldText } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useWriteAccess } from "@/subscription/write-access";
import { FrozenQuote } from "./frozen-quote";
import type { QuoteFormValues as Values } from "./quote-form-values";

const valuesOf = (quote: QuoteDetail): Values => ({
  title: quote.title,
  startDate: quote.startDate ?? "",
  adults: String(quote.adults),
  children: String(quote.children),
  days: quote.days,
  items: quote.items.map((item) => ({
    description: item.description,
    detail: item.detail,
    quantity: String(item.quantity),
    price: rupeesFieldText(item.unitPricePaise),
  })),
  taxRate: String(quote.taxRateBasisPoints),
  placeOfSupply: quote.placeOfSupply ?? "own",
  inclusions: quote.inclusions,
  exclusions: quote.exclusions,
  notes: quote.notes,
});

/** A day's or a line's field, as react-hook-form names it ("days.0.title"). */
const dayField = <Key extends "title" | "description">(index: number, key: Key) =>
  `days.${String(index)}.${key}` as `days.${number}.${Key}`;
const itemField = <Key extends "description" | "detail" | "quantity" | "price">(index: number, key: Key) =>
  `items.${String(index)}.${key}` as `items.${number}.${Key}`;

const placeOf = (value: string): UpdateQuoteInput["placeOfSupply"] =>
  value === "OUTSIDE_INDIA" ? value : (gstStates.find((state) => state.code === value)?.code ?? null);

const whole = (text: string) => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null);

/** The form as the api takes it, or the first field it can't read. */
function inputOf(quoteId: string, values: Values): UpdateQuoteInput | { problem: string } {
  const items = [];
  for (const [index, item] of values.items.entries()) {
    const price = paiseFromRupeesText(item.price);
    const quantity = whole(item.quantity);
    if (item.description.trim() === "") return { problem: `items.${String(index)}.description` };
    if (price === null || price < 0) return { problem: `items.${String(index)}.price` };
    if (quantity === null || quantity < 1) return { problem: `items.${String(index)}.quantity` };
    items.push({ description: item.description.trim(), detail: item.detail.trim(), quantity, unitPricePaise: price });
  }
  const adults = whole(values.adults);
  const children = whole(values.children);
  if (values.title.trim() === "") return { problem: "title" };
  if (adults === null) return { problem: "adults" };
  if (children === null) return { problem: "children" };
  const rate = Number(values.taxRate);
  return {
    quoteId,
    title: values.title.trim(),
    startDate: values.startDate === "" ? null : values.startDate,
    adults,
    children,
    days: values.days
      .map((day) => ({ title: day.title.trim(), description: day.description.trim() }))
      .filter((day) => day.title !== ""),
    items,
    inclusions: values.inclusions.trim(),
    exclusions: values.exclusions.trim(),
    notes: values.notes.trim(),
    taxRateBasisPoints: rate === 0 || rate === 1800 ? rate : 500,
    placeOfSupply: placeOf(values.placeOfSupply),
  };
}

function Preview({ control }: { control: Control<Values> }) {
  const t = useTranslations("quotes.form");
  const items = useWatch({ control, name: "items" });
  const rate = Number(useWatch({ control, name: "taxRate" }));
  const subtotal = items.reduce(
    (sum, item) => sum + (paiseFromRupeesText(item.price) ?? 0) * (whole(item.quantity) ?? 0),
    0,
  );
  const tax = Math.round((subtotal * rate) / 10_000);
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
      <dt className="text-muted-foreground">{t("subtotal")}</dt>
      <dd className="numbers text-right">{rupees(subtotal)}</dd>
      <dt className="text-muted-foreground">{t("gst", { rate: rate / 100 })}</dt>
      <dd className="numbers text-right">{rupees(tax)}</dd>
      <dt className="font-semibold">{t("total")}</dt>
      <dd className="numbers text-right font-semibold">{rupees(subtotal + tax)}</dd>
    </dl>
  );
}

export function QuoteForm({
  quote,
  onSave,
  sending,
}: {
  quote: QuoteDetail;
  onSave: (input: UpdateQuoteInput) => void;
  sending: { isPending: boolean; error: unknown };
}) {
  // Only a draft is written: a sent quote keeps its prices, and a new version is the way to change it.
  const frozen = quote.status !== "draft";
  const t = useTranslations("quotes.form");
  const access = useWriteAccess("change");
  const form = useForm<Values>({ defaultValues: valuesOf(quote) });
  const marks = useFillMarks(form, quoteConverter);
  const days = useFieldArray({ control: form.control, name: "days" });
  const items = useFieldArray({ control: form.control, name: "items" });
  const busy = sending.isPending || !access.allowed || frozen;
  const submit = form.handleSubmit((values) => {
    form.clearErrors();
    const input = inputOf(quote.id, values);
    if ("problem" in input) {
      form.setError(input.problem as "title", { message: t("problem") });
      form.setFocus(input.problem as "title");
      return;
    }
    // A quote the AI filled carries which fill and which fields, so the save is audited as drafted by AI.
    const aiFill = marks.use();
    onSave(aiFill === undefined ? input : { ...input, aiFill });
  });
  const errorOf = (name: string) =>
    form.getFieldState(name as "title").error === undefined ? undefined : t("problem");

  // A quote that was sent is read, not written: its words as text, with nothing to add or delete.
  if (frozen) return <FrozenQuote quote={quote} />;
  return (
    <FillMarksProvider marks={marks}>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
        <FillWithAi target="quote" subjectId={quote.id} marks={marks} />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("trip")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <AiMark paths={["quote.title"]} className="sm:col-span-2">
              <FormField label={t("title")} error={errorOf("title")}>
                {(links) => <Input {...links} {...form.register("title")} disabled={busy} />}
              </FormField>
            </AiMark>
            <AiMark paths={["quote.startDate"]}>
              <DateField control={form.control} name="startDate" label={t("startDate")} />
            </AiMark>
            <div className="grid grid-cols-2 gap-3">
              <AiMark paths={["quote.adults"]}>
                <FormField label={t("adults")} error={errorOf("adults")}>
                  {(links) => <Input {...links} inputMode="numeric" {...form.register("adults")} disabled={busy} />}
                </FormField>
              </AiMark>
              <AiMark paths={["quote.children"]}>
                <FormField label={t("children")} error={errorOf("children")}>
                  {(links) => <Input {...links} inputMode="numeric" {...form.register("children")} disabled={busy} />}
                </FormField>
              </AiMark>
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
            <AiMark paths={["quote.days"]}>
              {days.fields.length === 0 ? (
                <p className="text-muted-foreground">{t("noDays")}</p>
              ) : (
                <ItemGroup className="gap-3">
                  {days.fields.map((day, index) => (
                    <Item key={day.id} variant="muted" role="listitem" className="items-start">
                      <ItemContent className="gap-2">
                        <FormField label={t("dayTitle", { day: index + 1 })}>
                          {(links) => (
                            <Input
                              {...links}
                              placeholder={t("dayTitlePlaceholder")}
                              {...form.register(dayField(index, "title"))}
                              disabled={busy}
                            />
                          )}
                        </FormField>
                        <FormField label={t("dayDescription")}>
                          {(links) => (
                            <Textarea
                              {...links}
                              rows={2}
                              {...form.register(dayField(index, "description"))}
                              disabled={busy}
                            />
                          )}
                        </FormField>
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
            </AiMark>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("price")}</h2>
            </CardTitle>
            <CardAction>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  items.append({ description: "", detail: "", quantity: "1", price: "" });
                }}
              >
                <PlusIcon aria-hidden="true" />
                {t("addItem")}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AiMark paths={["quote.items"]}>
              {items.fields.length === 0 ? (
                <p className="text-muted-foreground">{t("noItems")}</p>
              ) : (
                <ItemGroup className="gap-3">
                  {items.fields.map((item, index) => (
                    <Item key={item.id} variant="muted" role="listitem" className="items-start">
                      <ItemContent className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                        <FormField label={t("itemDescription")} error={errorOf(`items.${String(index)}.description`)}>
                          {(links) => (
                            <Input
                              {...links}
                              placeholder={t("itemPlaceholder")}
                              {...form.register(itemField(index, "description"))}
                              disabled={busy}
                            />
                          )}
                        </FormField>
                        <FormField label={t("quantity")} error={errorOf(`items.${String(index)}.quantity`)}>
                          {(links) => (
                            <Input
                              {...links}
                              inputMode="numeric"
                              {...form.register(itemField(index, "quantity"))}
                              disabled={busy}
                            />
                          )}
                        </FormField>
                        <FormField label={t("unitPrice")} error={errorOf(`items.${String(index)}.price`)}>
                          {(links) => (
                            <Input
                              {...links}
                              inputMode="decimal"
                              className="numbers text-right"
                              {...form.register(itemField(index, "price"))}
                              disabled={busy}
                            />
                          )}
                        </FormField>
                        <FormField label={t("itemDetail")} className="sm:col-span-3">
                          {(links) => (
                            <Input
                              {...links}
                              placeholder={t("itemDetailPlaceholder")}
                              {...form.register(itemField(index, "detail"))}
                              disabled={busy}
                            />
                          )}
                        </FormField>
                      </ItemContent>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("removeItem", { item: index + 1 })}
                        disabled={busy}
                        onClick={() => {
                          items.remove(index);
                        }}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </AiMark>
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              <SelectField
                control={form.control}
                name="taxRate"
                label={t("taxRate")}
                hint={t("taxRateHint")}
                disabled={busy}
                options={[
                  { value: "500", label: t("taxRates.500") },
                  { value: "1800", label: t("taxRates.1800") },
                  { value: "0", label: t("taxRates.0") },
                ]}
              />
              <Preview control={form.control} />
              <SelectField
                control={form.control}
                name="placeOfSupply"
                label={t("placeOfSupply")}
                hint={t("placeOfSupplyHint")}
                disabled={busy}
                options={[
                  { value: "own", label: t("placeSame") },
                  ...gstStates.map((state) => ({
                    value: state.code,
                    label: (
                      <span className="flex gap-2">
                        <span className="numbers">{state.code}</span>
                        <span className="script-leading">{state.name}</span>
                      </span>
                    ),
                  })),
                  { value: "OUTSIDE_INDIA", label: t("placeOutside") },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("more")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(["inclusions", "exclusions", "notes"] as const).map((name) => (
              <AiMark key={name} paths={[`quote.${name}` as const]}>
                <FormField label={t(name)} hint={t(`${name}Hint`)}>
                  {(links) => <Textarea {...links} rows={3} {...form.register(name)} disabled={busy} />}
                </FormField>
              </AiMark>
            ))}
          </CardContent>
        </Card>

        <RefusalAlert error={sending.error} />
        <div className="sticky bottom-4 flex justify-end">
          <Button type="submit" size="lg" disabled={busy}>
            {sending.isPending && <Spinner aria-hidden="true" />}
            {sending.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </FillMarksProvider>
  );
}
