"use client";

// Finance's two forms (step 6, P0): a booking's supplier cost (what, who, how much, when it is due, and whether it is
// paid already) and a running cost of the agency (what, how much, the day). Checked by the api's own schema.
import {
  addExpenseInput,
  addTripCostInput,
  expenseCategories,
  tripCostCategories,
  type AddExpenseInput,
  type AddTripCostInput,
} from "@travel-crm/contracts/finance";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { MoneyField } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useHolds } from "@/session/me-context";
import { SupplierField, type PickedSupplier } from "@/suppliers/supplier-field";
import { useFinanceChanges, useToday } from "./use-finance";

type Problem = "required" | "invalid";
const amountOf = (text: string) => paiseFromRupeesText(text) ?? -1;
const fieldOf =
  <Field extends string>(fields: readonly Field[], renamed: Partial<Record<string, Field>> = {}) =>
  (path: readonly PropertyKey[]): Field | undefined => {
    const key = String(path[0]);
    return renamed[key] ?? fields.find((field) => field === key);
  };

interface Sending {
  isPending: boolean;
  error: unknown;
}

/** What a cost is recorded against: a booking's quote, or a whole departure (the hotel block, the bus). */
export type CostOwner = { quoteId: string } | { departureId: string };

interface CostValues {
  category: string;
  supplier: string;
  linked: PickedSupplier | null;
  amount: string;
  dueOn: string;
  paidOn: string;
  note: string;
}

const kindOf = (category: string) =>
  category === "hotel" || category === "transport" || category === "guide" ? category : "other";

function CostForm({
  formId,
  owner,
  onSave,
  sending,
}: {
  formId: string;
  owner: CostOwner;
  onSave: (input: AddTripCostInput) => void;
  sending: Sending;
}) {
  const t = useTranslations("finance.costForm");
  const keepsSuppliers = useHolds("suppliers:view");
  const values: CostValues = {
    category: "hotel",
    supplier: "",
    linked: null,
    amount: "",
    dueOn: "",
    paidOn: "",
    note: "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<CostValues, AddTripCostInput, Problem>(
    values,
    (typed) =>
      checked(
        addTripCostInput.safeParse({
          quoteId: "quoteId" in owner ? owner.quoteId : null,
          departureId: "departureId" in owner ? owner.departureId : null,
          supplierId: typed.linked?.id ?? null,
          category: typed.category,
          supplier: typed.linked?.name ?? typed.supplier,
          amountPaise: amountOf(typed.amount),
          dueOn: typed.dueOn === "" ? null : typed.dueOn,
          paidOn: typed.paidOn === "" ? null : typed.paidOn,
          note: typed.note,
        }),
        typed,
        fieldOf(["category", "supplier", "amount", "dueOn", "paidOn", "note"] as const, {
          amountPaise: "amount",
          supplierId: "linked",
        }),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <SelectField
        control={form.control}
        name="category"
        label={t("category")}
        disabled={sending.isPending}
        options={tripCostCategories.map((category) => ({ value: category, label: t(`categories.${category}`) }))}
      />
      {keepsSuppliers && <SupplierField control={form.control} name="linked" kind={kindOf(form.watch("category"))} />}
      {(!keepsSuppliers || form.watch("linked") === null) && (
        <TextField
          control={form.control}
          name="supplier"
          label={keepsSuppliers ? t("supplierName") : t("supplier")}
          hint={t("supplierHint")}
          disabled={sending.isPending}
        />
      )}
      <MoneyField control={form.control} name="amount" label={t("amount")} />
      <DateField control={form.control} name="dueOn" label={t("dueOn")} hint={t("dueOnHint")} />
      <DateField control={form.control} name="paidOn" label={t("paidOn")} hint={t("paidOnHint")} />
      <TextField control={form.control} name="note" label={t("note")} disabled={sending.isPending} />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function AddCostDialog({ owner }: { owner: CostOwner }) {
  const t = useTranslations("finance.costs");
  const dialog = useFormDialog(t("added"));
  const { addCost } = useFinanceChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={addCost}
      trigger={{ label: "departureId" in owner ? t("addDeparture") : t("add"), variant: "outline" }}
      title={"departureId" in owner ? t("addDepartureTitle") : t("addTitle")}
      description={"departureId" in owner ? t("addDepartureDescription") : t("addDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <CostForm
          formId={formId}
          owner={owner}
          sending={addCost}
          onSave={(input) => {
            addCost.mutate(input, { onSuccess: () => void dialog.onSuccess() });
          }}
        />
      )}
    </FormDialog>
  );
}

function ExpenseForm({
  formId,
  onSave,
  sending,
}: {
  formId: string;
  onSave: (input: AddExpenseInput) => void;
  sending: Sending;
}) {
  const t = useTranslations("finance.expenseForm");
  const values = { category: "salary", description: "", amount: "", spentOn: useToday(), note: "" };
  const { form, onSubmit, formProblem } = useCheckedForm<typeof values, AddExpenseInput, Problem>(
    values,
    (typed) =>
      checked(
        addExpenseInput.safeParse({
          category: typed.category,
          description: typed.description,
          amountPaise: amountOf(typed.amount),
          spentOn: typed.spentOn,
          note: typed.note,
        }),
        typed,
        fieldOf(["category", "description", "amount", "spentOn", "note"] as const, { amountPaise: "amount" }),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <SelectField
        control={form.control}
        name="category"
        label={t("category")}
        disabled={sending.isPending}
        options={expenseCategories.map((category) => ({ value: category, label: t(`categories.${category}`) }))}
      />
      <TextField
        control={form.control}
        name="description"
        label={t("description")}
        hint={t("descriptionHint")}
        disabled={sending.isPending}
      />
      <MoneyField control={form.control} name="amount" label={t("amount")} />
      <DateField control={form.control} name="spentOn" label={t("spentOn")} />
      <TextField control={form.control} name="note" label={t("note")} disabled={sending.isPending} />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function AddExpenseDialog() {
  const t = useTranslations("finance.expenses");
  const dialog = useFormDialog(t("added"));
  const { addExpense } = useFinanceChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={addExpense}
      trigger={{ label: t("add"), variant: "default" }}
      title={t("addTitle")}
      description={t("addDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <ExpenseForm
          formId={formId}
          sending={addExpense}
          onSave={(input) => {
            addExpense.mutate(input, { onSuccess: () => void dialog.onSuccess() });
          }}
        />
      )}
    </FormDialog>
  );
}
