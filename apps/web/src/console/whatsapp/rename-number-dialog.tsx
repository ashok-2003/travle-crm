"use client";

// Rename one WhatsApp number (spec 2026-11-22 section 10): its short label, which staff see on its chats in the inbox
// once the agency has two numbers. Checked by the api's own schema before it is sent; a FormDialog, so it holds while the
// request is out and the numbers load again even once it closes.
import { renameWhatsappInput, type ConsoleNumber, type RenameWhatsappInput } from "@travel-crm/contracts/inbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type Sending } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../data/console-trpc";

interface RenameValues extends Record<string, unknown> {
  label: string;
}

function RenameForm({
  formId,
  number,
  rename,
}: {
  formId: string;
  number: ConsoleNumber;
  rename: Sending<RenameWhatsappInput>;
}) {
  const t = useTranslations("consoleWhatsapp.rename");
  const { form, onSubmit, formProblem } = useCheckedForm<RenameValues, RenameWhatsappInput, "required" | "tooLong">(
    { label: number.label },
    (values) =>
      checked(
        renameWhatsappInput.safeParse({
          organizationId: number.organizationId,
          connectionId: number.id,
          label: values.label,
        }),
        values,
        ([key]) => (key === "label" ? "label" : undefined),
        () => "tooLong",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(rename.mutate)} className="flex flex-col gap-4">
      <FieldGroup>
        <TextField control={form.control} name="label" label={t("label")} autoComplete="off" />
      </FieldGroup>
      <FormAlert sending={rename} problem={formProblem} />
    </form>
  );
}

export function RenameNumberDialog({ number }: { number: ConsoleNumber }) {
  const t = useTranslations("consoleWhatsapp.rename");
  const tGroup = useTranslations("consoleWhatsapp.group");
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const dialog = useFormDialog(t("done"), () => queryClient.invalidateQueries({ queryKey: trpc.whatsapp.pathKey() }));
  const rename = useMutation(trpc.whatsapp.rename.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      dialog={dialog}
      sending={rename}
      trigger={{ label: tGroup("rename") }}
      title={t("title", { label: number.label })}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <RenameForm formId={formId} number={number} rename={rename} />}
    </FormDialog>
  );
}
