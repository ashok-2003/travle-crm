"use client";

// New package (/packages): a name and a kind, a custom trip or a group trip, then its own page opens to fill in the rest
// (prices, seasons, departures, files and whether the AI sells it).
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

type Problem = "required" | "tooLong";

function NewPackageForm({
  formId,
  onCreate,
  sending,
}: {
  formId: string;
  onCreate: (input: CreatePackageInput) => void;
  sending: { isPending: boolean; error: unknown };
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
    </form>
  );
}

export function NewPackageDialog() {
  const t = useTranslations("packages.create");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const dialog = useFormDialog(t("created"));
  const create = useMutation(
    trpc.quotes.createPackage.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.quotes.packages.pathKey() }),
    }),
  );
  return (
    <FormDialog
      dialog={dialog}
      sending={create}
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
