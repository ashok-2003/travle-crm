"use client";

// A contact at a supplier (release 7a): a name, role, phone, WhatsApp and email.
import { saveContactInput, type SaveContactInput, type SupplierContact } from "@travel-crm/contracts/suppliers";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useSupplierChanges } from "./use-suppliers";

type Problem = "required" | "invalid";
interface Values {
  name: string;
  role: string;
  phone: string;
  whatsapp: string;
  email: string;
}

function ContactForm({
  formId,
  supplierId,
  contact,
  changes,
  dialog,
}: {
  formId: string;
  supplierId: string;
  contact: SupplierContact | null;
  changes: ReturnType<typeof useSupplierChanges>;
  dialog: { onSuccess: () => Promise<void> };
}) {
  const t = useTranslations("suppliers.contacts.form");
  const values: Values = {
    name: contact?.name ?? "",
    role: contact?.role ?? "",
    phone: contact?.phone ?? "",
    whatsapp: contact?.whatsapp ?? "",
    email: contact?.email ?? "",
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, SaveContactInput, Problem>(
    values,
    (typed) =>
      checked(
        saveContactInput.safeParse({ supplierId, ...(contact === null ? {} : { contactId: contact.id }), ...typed }),
        typed,
        (path) => (Object.keys(values) as (keyof Values)[]).find((field) => field === String(path[0])),
        () => "invalid",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const busy = changes.saveContact.isPending;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        changes.saveContact.mutate(input, { onSuccess: () => void dialog.onSuccess() });
      })}
    >
      <TextField control={form.control} name="name" label={t("name")} disabled={busy} />
      <TextField control={form.control} name="role" label={t("role")} hint={t("roleHint")} disabled={busy} />
      <TextField control={form.control} name="phone" label={t("phone")} type="tel" disabled={busy} />
      <TextField control={form.control} name="whatsapp" label={t("whatsapp")} type="tel" disabled={busy} />
      <TextField control={form.control} name="email" label={t("email")} type="email" disabled={busy} />
      <FormAlert sending={changes.saveContact} problem={formProblem} />
    </form>
  );
}

export function ContactDialog({ supplierId, contact }: { supplierId: string; contact: SupplierContact | null }) {
  const t = useTranslations("suppliers.contacts");
  const dialog = useFormDialog(t("form.saved"));
  const changes = useSupplierChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={changes.saveContact}
      trigger={
        contact === null
          ? { label: t("add"), variant: "outline" }
          : { label: t("edit"), accessibleLabel: t("editNamed", { name: contact.name }), variant: "outline" }
      }
      title={contact === null ? t("form.addTitle") : t("form.editTitle")}
      description={t("form.description")}
      submit={t("form.save")}
      submitting={t("form.saving")}
    >
      {(formId) => (
        <ContactForm formId={formId} supplierId={supplierId} contact={contact} changes={changes} dialog={dialog} />
      )}
    </FormDialog>
  );
}
