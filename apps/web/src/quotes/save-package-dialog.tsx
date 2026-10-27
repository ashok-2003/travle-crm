"use client";

// Save as package (sales execution, fast quoting): the quote's plan and price kept under a name ("Manali 5 days"), so the
// next lead's quote is one tap from a lead's New quote.
import { savePackageInput, type SavePackageInput } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useQuoteChanges } from "./use-quotes";

type Problem = "required" | "tooLong";

function PackageForm({
  formId,
  quoteId,
  title,
  onSave,
  sending,
}: {
  formId: string;
  quoteId: string;
  title: string;
  onSave: (input: SavePackageInput) => void;
  sending: { isPending: boolean; error: unknown };
}) {
  const t = useTranslations("quotes.package");
  const { form, onSubmit, formProblem } = useCheckedForm<{ name: string }, SavePackageInput, Problem>(
    { name: title },
    (values) =>
      checked(
        savePackageInput.safeParse({ quoteId, name: values.name }),
        values,
        (path) => (path[0] === "name" ? "name" : undefined),
        () => "tooLong",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <TextField
        control={form.control}
        name="name"
        label={t("name")}
        hint={t("nameHint")}
        disabled={sending.isPending}
      />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function SavePackageDialog({ quoteId, title }: { quoteId: string; title: string }) {
  const t = useTranslations("quotes.package");
  const dialog = useFormDialog(t("saved"));
  const { savePackage } = useQuoteChanges();
  return (
    <FormDialog
      dialog={dialog}
      sending={savePackage}
      trigger={{ label: t("save"), variant: "outline" }}
      title={t("title")}
      description={t("description")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <PackageForm
          formId={formId}
          quoteId={quoteId}
          title={title}
          sending={savePackage}
          onSave={(input) => {
            savePackage.mutate(input, { onSuccess: () => void dialog.onSuccess() });
          }}
        />
      )}
    </FormDialog>
  );
}
