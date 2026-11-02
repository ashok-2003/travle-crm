"use client";

// Adding a supplier, or changing one (release 7a). The bank and UPI details are plain text, shown only to people who may
// change suppliers (the api leaves them out for everyone else).
import {
  createSupplierInput,
  supplierKinds,
  type CreateSupplierInput,
  type SupplierDetail,
} from "@travel-crm/contracts/suppliers";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { NoteField } from "@/leads/form/note-field";
import { useSupplierChanges } from "./use-suppliers";

type Problem = "required" | "invalid";
type Values = Record<keyof CreateSupplierInput, string>;

function SupplierForm({
  formId,
  supplier,
  changes,
  dialog,
  onSaved,
}: {
  formId: string;
  supplier: SupplierDetail | null;
  changes: ReturnType<typeof useSupplierChanges>;
  dialog: { onSuccess: () => Promise<void> };
  onSaved?: ((id: string) => void) | undefined;
}) {
  const t = useTranslations("suppliers");
  const tForm = useTranslations("suppliers.form");
  const sending = supplier === null ? changes.create : changes.update;
  const values: Values = {
    kind: supplier?.kind ?? "hotel",
    name: supplier?.name ?? "",
    city: supplier?.city ?? "",
    gstin: supplier?.gstin ?? "",
    paymentTerms: supplier?.paymentTerms ?? "",
    paymentDetails: supplier?.paymentDetails ?? "",
    notes: supplier?.notes ?? "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CreateSupplierInput, Problem>(
    values,
    (typed) =>
      checked(
        createSupplierInput.safeParse(typed),
        typed,
        (path) => (Object.keys(values) as (keyof Values)[]).find((field) => field === String(path[0])),
        () => "invalid",
      ),
    (problem) => tForm(`problems.${problem}`),
  );
  const busy = sending.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        if (supplier === null) {
          changes.create.mutate(input, {
            onSuccess: (created) => {
              void dialog.onSuccess().then(() => onSaved?.(created.id));
            },
          });
        } else {
          changes.update.mutate({ supplierId: supplier.id, ...input }, { onSuccess: () => void dialog.onSuccess() });
        }
      })}
    >
      <SelectField
        control={form.control}
        name="kind"
        label={tForm("kind")}
        disabled={busy}
        options={supplierKinds.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) }))}
      />
      <TextField control={form.control} name="name" label={tForm("name")} disabled={busy} />
      <TextField control={form.control} name="city" label={tForm("city")} disabled={busy} />
      <TextField control={form.control} name="gstin" label={tForm("gstin")} hint={tForm("gstinHint")} disabled={busy} />
      <TextField
        control={form.control}
        name="paymentTerms"
        label={tForm("paymentTerms")}
        hint={tForm("paymentTermsHint")}
        disabled={busy}
      />
      <NoteField
        control={form.control}
        name="paymentDetails"
        label={tForm("paymentDetails")}
        hint={tForm("paymentDetailsHint")}
        disabled={busy}
      />
      <NoteField control={form.control} name="notes" label={tForm("notes")} disabled={busy} />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function SupplierFormDialog({
  supplier,
  trigger,
  onSaved,
}: {
  supplier: SupplierDetail | null;
  trigger: { label: string; variant?: "default" | "outline" };
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations("suppliers.form");
  const dialog = useFormDialog(supplier === null ? t("created") : t("saved"));
  const changes = useSupplierChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={supplier === null ? changes.create : changes.update}
      trigger={trigger}
      title={supplier === null ? t("newTitle") : t("editTitle")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <SupplierForm formId={formId} supplier={supplier} changes={changes} dialog={dialog} onSaved={onSaved} />
      )}
    </FormDialog>
  );
}
