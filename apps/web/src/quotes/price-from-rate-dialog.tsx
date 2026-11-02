"use client";

// Price from rate (release 7b): pick a supplier, then one of the rates its season holds for the quote's start date, and say how
// many. The line comes back with the supplier's cost copied in (a snapshot: later rate edits never change a quote) and a
// selling price of cost plus the agency's markup, which the person can change. A start date with no season is "No rate for
// these dates": nothing is guessed. For whoever may see margins, since a rate is what the agency pays.
import { useMutation, useQuery } from "@tanstack/react-query";
import { priceLineInput, type PricedLine } from "@travel-crm/contracts/suppliers";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { rupees } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { SupplierField, type PickedSupplier } from "@/suppliers/supplier-field";

type Problem = "required" | "invalid";
interface Values {
  supplier: PickedSupplier | null;
  rateId: string;
  quantity: string;
}

type Rates = { id: string; item: string; mealPlan: string; occupancy: string; unit: string; costPaise: number }[];

function PriceForm({
  formId,
  startDate,
  priced,
  dialog,
  pricing,
}: {
  formId: string;
  startDate: string;
  priced: (line: PricedLine) => void;
  dialog: { onSuccess: () => Promise<void> };
  pricing: ReturnType<typeof usePricing>;
}) {
  const t = useTranslations("quotes.rates");
  const tRates = useTranslations("suppliers.rates");
  const trpc = useTRPC();
  const values: Values = { supplier: null, rateId: "", quantity: "1" };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, Parameters<typeof pricing.mutate>[0], Problem>(
    values,
    (typed) =>
      checked(
        priceLineInput.safeParse({
          rateId: typed.rateId,
          date: startDate,
          quantity: /^\d{1,4}$/.test(typed.quantity.trim()) ? Number(typed.quantity.trim()) : Number.NaN,
        }),
        typed,
        (path) => (path[0] === "rateId" ? "rateId" : path[0] === "quantity" ? "quantity" : undefined),
        () => "invalid",
        typed.supplier === null ? { supplier: "required" } : {},
      ),
    () => t("problem"),
  );
  const supplier = form.watch("supplier");
  const onDate = useQuery(
    trpc.quotes.ratesOnDate.queryOptions(
      { supplierId: supplier?.id ?? "", date: startDate },
      { enabled: supplier !== null && startDate !== "" },
    ),
  );
  const rates: Rates = onDate.data?.rates ?? [];
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        pricing.mutate(input, {
          onSuccess: (line) => {
            priced(line);
            void dialog.onSuccess();
          },
        });
      })}
    >
      <SupplierField control={form.control} name="supplier" kind="hotel" />
      {supplier !== null && onDate.data?.season === null && (
        <Alert variant="destructive">
          <AlertDescription>{t("noRate")}</AlertDescription>
        </Alert>
      )}
      {supplier !== null && onDate.data?.season && (
        <SelectField
          control={form.control}
          name="rateId"
          label={t("rate", { season: onDate.data.season.label })}
          placeholder={t("choose")}
          options={rates.map((rate) => ({
            value: rate.id,
            label: [
              rate.item,
              rate.mealPlan,
              rate.occupancy === "" ? "" : tRates(`occupancies.${rate.occupancy as "single"}`),
              tRates(`units.${rate.unit as "per_trip"}`),
              rupees(rate.costPaise),
            ]
              .filter((part) => part !== "")
              .join(" · "),
          }))}
        />
      )}
      <TextField
        control={form.control}
        name="quantity"
        label={t("quantity")}
        hint={t("quantityHint")}
        inputMode="numeric"
        className="numbers"
      />
      <FormAlert sending={pricing} problem={formProblem} />
    </form>
  );
}

function usePricing() {
  const client = useTRPCClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof client.quotes.priceLine.query>[0]) => client.quotes.priceLine.query(input),
  });
}

/**
 * The dialog alone, opened from a button the quote form holds: it sits beside the form, never inside it, because a submit in a
 * dialog reaches the form around it through React's tree (portals included) and would save the quote under it.
 */
export function PriceFromRateDialog({
  startDate,
  priced,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  startDate: string;
  priced: (line: PricedLine) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("quotes.rates");
  const held: OpenState = { open, setOpen: onOpenChange };
  const dialog = useFormDialog(t("added"), () => Promise.resolve(), held);
  const pricing = usePricing();
  return (
    <FormDialog
      dialog={dialog}
      sending={pricing}
      title={t("title")}
      description={startDate === "" ? t("needDate") : t("description")}
      submit={t("add")}
      submitting={t("adding")}
      canSubmit={startDate !== ""}
      returnFocusTo={returnFocusTo}
    >
      {(formId) => (
        <PriceForm formId={formId} startDate={startDate} priced={priced} dialog={dialog} pricing={pricing} />
      )}
    </FormDialog>
  );
}
