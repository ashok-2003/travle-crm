"use client";

// The payments due on a booking, written as rows (a label, an amount, a day) that must add up to the trip's total: used when
// the agency confirms a booking with no payments due (the default schedule is offered, to change or keep) and to change the
// payments due later. Rows are added and removed in place; the sum is shown as you type.
import { schedule as scheduleSchema, type ScheduleRow } from "@travel-crm/contracts/bookings";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { FormAlert } from "@/components/forms/form-dialog";
import { MoneyField, rupees, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";

interface Values {
  rows: { id: string; label: string; amount: string; dueOn: string }[];
}

const valuesOf = (rows: readonly (Omit<ScheduleRow, "id"> & { id?: string | undefined })[]): Values => ({
  rows: rows.map((row) => ({
    id: row.id ?? "",
    label: row.label,
    amount: rupeesFieldText(row.amountPaise),
    dueOn: row.dueOn,
  })),
});

export function ScheduleForm({
  formId,
  initial,
  totalPaise,
  sending,
  onSave,
}: {
  formId: string;
  initial: readonly (Omit<ScheduleRow, "id"> & { id?: string | undefined })[];
  totalPaise: number;
  sending: { isPending: boolean; error: unknown };
  onSave: (rows: ScheduleRow[]) => void;
}) {
  const t = useTranslations("bookings.schedule");
  const form = useForm<Values>({ defaultValues: valuesOf(initial) });
  const fields = useFieldArray({ control: form.control, name: "rows" });
  const typed = useWatch({ control: form.control, name: "rows" });
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const sum = typed.reduce((total, row) => total + (paiseFromRupeesText(row.amount) ?? 0), 0);
  const submit = form.handleSubmit((values) => {
    setProblem(undefined);
    const rows = values.rows.map((row) => ({
      ...(row.id === "" ? {} : { id: row.id }),
      label: row.label.trim(),
      amountPaise: paiseFromRupeesText(row.amount) ?? -1,
      dueOn: row.dueOn,
    }));
    if (!scheduleSchema.min(1).safeParse(rows).success) {
      setProblem(t("problems.check"));
      return;
    }
    if (rows.reduce((total, row) => total + row.amountPaise, 0) !== totalPaise) {
      setProblem(t("problems.sum", { total: rupees(totalPaise) }));
      return;
    }
    onSave(rows);
  });
  return (
    <form id={formId} noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <ItemGroup className="gap-3">
        {fields.fields.map((row, index) => (
          <Item key={row.id} variant="muted" role="listitem" className="items-start">
            <ItemContent className="gap-3">
              <TextField
                control={form.control}
                name={`rows.${String(index)}.label` as `rows.${number}.label`}
                label={t("label", { number: index + 1 })}
                disabled={sending.isPending}
              />
              <MoneyField
                control={form.control}
                name={`rows.${String(index)}.amount` as `rows.${number}.amount`}
                label={t("amount", { number: index + 1 })}
              />
              <DateField
                control={form.control}
                name={`rows.${String(index)}.dueOn` as `rows.${number}.dueOn`}
                label={t("dueOn", { number: index + 1 })}
              />
            </ItemContent>
            {fields.fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("remove", { number: index + 1 })}
                disabled={sending.isPending}
                onClick={() => {
                  fields.remove(index);
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            )}
          </Item>
        ))}
      </ItemGroup>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={sending.isPending || fields.fields.length >= 12}
        onClick={() => {
          fields.append({ id: "", label: "", amount: "", dueOn: "" });
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t("add")}
      </Button>
      <p className={sum === totalPaise ? "text-muted-foreground" : "text-status-attention-ink"}>
        {t("sum", { sum: rupees(sum), total: rupees(totalPaise) })}
      </p>
      <FormAlert sending={sending} problem={problem} />
    </form>
  );
}
