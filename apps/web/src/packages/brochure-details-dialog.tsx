"use client";

// The words the AI picks a brochure by: its name and a short description, written by the owner and checked by the api's
// own schema. A dialog opened by its row's Describe button, which takes the focus back.
import {
  BROCHURE_DESCRIPTION_MAX,
  BROCHURE_NAME_MAX,
  describeBrochureInput,
  type DescribeBrochureInput,
  type PackageFile,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { NoteField } from "@/leads/form/note-field";
import { useDescribeBrochure, useRefreshPackageFiles } from "./use-package-files";

interface Values {
  name: string;
  description: string;
}
type Problem = "required" | "tooLong";

function BrochureForm({
  formId,
  packageId,
  file,
  onSave,
  sending,
}: {
  formId: string;
  packageId: string;
  file: PackageFile;
  onSave: (input: DescribeBrochureInput) => void;
  sending: { isPending: boolean; error: unknown };
}) {
  const t = useTranslations("packages.files.details");
  const { form, onSubmit, formProblem } = useCheckedForm<Values, DescribeBrochureInput, Problem>(
    { name: file.name ?? "", description: file.description ?? "" },
    (values) =>
      checked(
        describeBrochureInput.safeParse({ packageId, attachmentId: file.attachmentId, ...values }),
        values,
        (path) => (path[0] === "name" || path[0] === "description" ? path[0] : undefined),
        (): Problem => "tooLong",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const [name, description] = form.watch(["name", "description"]);
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <TextField
        control={form.control}
        name="name"
        label={t("name")}
        hint={t("count", { used: name.length, max: BROCHURE_NAME_MAX })}
        autoComplete="off"
        disabled={sending.isPending}
      />
      <NoteField
        control={form.control}
        name="description"
        label={t("description")}
        hint={t("count", { used: description.length, max: BROCHURE_DESCRIPTION_MAX })}
        disabled={sending.isPending}
      />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function BrochureDetailsDialog({
  packageId,
  file,
  held,
  returnFocusTo,
}: {
  packageId: string;
  file: PackageFile;
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.files.details");
  const refresh = useRefreshPackageFiles(packageId);
  const dialog = useFormDialog(t("saved"), refresh, held);
  const describe = useDescribeBrochure();
  return (
    <FormDialog
      dialog={dialog}
      sending={describe}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={t("dialogDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => (
        <BrochureForm
          formId={formId}
          packageId={packageId}
          file={file}
          onSave={(input) => {
            describe.mutate(input, { onSuccess: () => void dialog.onSuccess() });
          }}
          sending={describe}
        />
      )}
    </FormDialog>
  );
}
