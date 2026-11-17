"use client";

// New package (/packages): a name and a kind, a custom trip or a group trip, then its own page opens to fill in the rest
// (prices, seasons, departures, files and whether the AI sells it). Or PDF brochures, one or several: every trip in them
// becomes a group package at once, what the AI still needs to sell each shown in red. While they are made the dialog
// stays open.
import { createPackageInput, type CreatePackageInput } from "@travel-crm/contracts/quotes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { FormAlert, FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useTRPC } from "@/data/trpc";
import { packageRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { PdfImportSection } from "./pdf-import-section";
import { usePdfImport } from "./use-pdf-import";

type Problem = "required" | "tooLong";

function NewPackageForm({
  formId,
  onCreate,
  sending,
  importer,
}: {
  formId: string;
  onCreate: (input: CreatePackageInput) => void;
  sending: { isPending: boolean; error: unknown };
  /** PDFs in, packages out; null for a member who may not ask the AI. */
  importer: ReturnType<typeof usePdfImport> | null;
}) {
  const t = useTranslations("packages.create");
  const tForm = useTranslations("packages.form");
  const { form, onSubmit, formProblem } = useCheckedForm<CreatePackageInput, CreatePackageInput, Problem>(
    { name: "", kind: "group" },
    (values) =>
      checked(
        createPackageInput.safeParse(values),
        values,
        (path) => (path[0] === "name" ? "name" : undefined),
        () => "tooLong",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onCreate)} className="flex flex-col gap-4">
      <TextField
        control={form.control}
        name="name"
        label={t("name")}
        hint={t("nameHint")}
        disabled={sending.isPending}
      />
      <ChoiceField
        control={form.control}
        name="kind"
        legend={t("kind")}
        options={[
          { value: "group", label: tForm("kinds.group") },
          { value: "custom", label: tForm("kinds.custom") },
        ]}
      />
      <FormAlert sending={sending} problem={formProblem} />
      {importer !== null && <PdfImportSection importer={importer} />}
    </form>
  );
}

export function NewPackageDialog() {
  const t = useTranslations("packages.create");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const dialog = useFormDialog(t("created"));
  const importer = usePdfImport();
  // Reading a PDF asks the AI: the api needs ai:suggest beside quotes:edit.
  const mayImport = useHolds("ai:suggest");
  const create = useMutation(
    trpc.quotes.createPackage.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.quotes.packages.pathKey() }),
    }),
  );
  return (
    <FormDialog
      dialog={dialog}
      // While PDFs are made into packages nothing closes the dialog, so their results are seen.
      sending={{
        isPending: create.isPending || importer.running,
        // Closed and opened again, it starts afresh: the last PDFs' results are gone.
        reset: () => {
          create.reset();
          importer.clear();
        },
      }}
      trigger={{ label: t("new"), variant: "default" }}
      title={t("title")}
      description={t("description")}
      submit={t("create")}
      submitting={t("creating")}
    >
      {(formId) => (
        <NewPackageForm
          formId={formId}
          sending={create}
          importer={mayImport ? importer : null}
          onCreate={(input) => {
            create.mutate(input, {
              onSuccess: ({ id }) => {
                void dialog.onSuccess().then(() => {
                  router.push(packageRoute(id));
                });
              },
            });
          }}
        />
      )}
    </FormDialog>
  );
}
