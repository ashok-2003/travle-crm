"use client";

// A tier of a package (Standard, Deluxe): its name and its priced lines (release 7b). Rates are looked up when a quote is made,
// for its start date; nothing is priced here. Checked by the api's own schema, a problem named on the line it is in.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { saveTierInput, type PackageTier } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { useHolds } from "@/session/me-context";
import { emptyLine, TierLines, type LineValues, type TierValues } from "./tier-lines";
import { usePackageChanges } from "./use-packages";

const lineOf = (line: PackageTier["lines"][number]): LineValues => ({
  description: line.description,
  detail: line.detail,
  mode: line.rateId === null ? "fixed" : "rate",
  rateId: line.rateId ?? "",
  rateLabel: line.rateLabel ?? "",
  supplier: null,
  quantityRule: line.quantityRule,
  quantity: String(line.quantity),
  price: line.unitPricePaise === 0 ? "" : rupeesFieldText(line.unitPricePaise),
});

function TierForm({
  formId,
  packageId,
  tier,
  changes,
  dialog,
}: {
  formId: string;
  packageId: string;
  tier: PackageTier | null;
  changes: ReturnType<typeof usePackageChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("packages.tier");
  const seesMargin = useHolds("money:view_margin");
  const seesSuppliers = useHolds("suppliers:view");
  const mayPickRates = seesMargin && seesSuppliers;
  const form = useForm<TierValues>({
    defaultValues: { name: tier?.name ?? "", lines: tier === null ? [emptyLine()] : tier.lines.map(lineOf) },
  });
  const busy = changes.saveTier.isPending;
  const submit = form.handleSubmit((values) => {
    form.clearErrors();
    // Each field the person must look at, as react-hook-form names it ("lines.1.price").
    const failed = new Set<string>();
    const lines = values.lines.map((line, index) => {
      const price = line.price.trim() === "" ? 0 : paiseFromRupeesText(line.price);
      const quantity = /^\d{1,4}$/.test(line.quantity.trim()) ? Number(line.quantity.trim()) : Number.NaN;
      if (price === null) failed.add(`lines.${String(index)}.price`);
      if (line.mode === "rate" && line.rateId === "") failed.add(`lines.${String(index)}.rateId`);
      return {
        description: line.description,
        detail: line.detail,
        rateId: line.mode === "rate" && line.rateId !== "" ? line.rateId : null,
        quantityRule: line.quantityRule,
        quantity: line.quantityRule === "fixed" ? quantity : 1,
        unitPricePaise: line.mode === "rate" ? 0 : (price ?? Number.NaN),
      };
    });
    const parsed = saveTierInput.safeParse({
      packageId,
      ...(tier === null ? {} : { tierId: tier.id }),
      name: values.name,
      lines,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [first, index, key] = issue.path;
        if (first === "name") failed.add("name");
        else if (first === "lines" && typeof index === "number") {
          failed.add(`lines.${String(index)}.${key === "unitPricePaise" ? "price" : String(key ?? "description")}`);
        }
      }
    }
    if (failed.size > 0) {
      for (const path of failed) form.setError(path as "name", { message: t("problem") });
      return;
    }
    if (parsed.success) changes.saveTier.mutate(parsed.data, { onSuccess: () => void dialog.onSuccess() });
  });
  return (
    <form id={formId} noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <TextField control={form.control} name="name" label={t("name")} hint={t("nameHint")} disabled={busy} />
      <TierLines form={form} mayPickRates={mayPickRates} />
      <FormAlert sending={changes.saveTier} problem={undefined} />
    </form>
  );
}

export function TierDialog({ packageId, tier }: { packageId: string; tier: PackageTier | null }) {
  const t = useTranslations("packages.tier");
  const dialog = useFormDialog(t("saved"));
  const changes = usePackageChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.saveTier}
      trigger={
        tier === null
          ? { label: t("add"), variant: "outline" }
          : { label: t("edit"), accessibleLabel: t("editNamed", { name: tier.name }), variant: "outline" }
      }
      title={tier === null ? t("addTitle") : t("editTitle")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <TierForm formId={formId} packageId={packageId} tier={tier} changes={changes} dialog={dialog} />}
    </FormDialog>
  );
}
