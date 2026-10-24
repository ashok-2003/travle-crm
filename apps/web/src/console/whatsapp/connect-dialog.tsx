"use client";

// Connect a number (spec 3.5): the number the agency's customers message, the same number as MSG91 writes it, how it was
// added, MSG91's own ids (free text, optional) and a note. The api's own schema checks it; the connection starts as Setting
// up. The form is mounted only while the dialog is open (components/forms/form-dialog.tsx).
import { connectWhatsappInput, type ConnectWhatsappInput } from "@travel-crm/contracts/inbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked, type Checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { FormAlert, FormDialog, useFormDialog, type Sending } from "@/components/forms/form-dialog";
import { PhoneField } from "@/components/forms/phone-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../data/console-trpc";

interface ConnectValues extends Record<string, unknown> {
  displayNumber: string;
  integratedNumber: string;
  mode: string;
  providerRef: string;
  wabaId: string;
  phoneNumberId: string;
  note: string;
}

type Problem = "required" | "invalid";

const optional = (text: string) => (text.trim() === "" ? {} : { value: text.trim() });

function check(organizationId: string, values: ConnectValues): Checked<ConnectValues, ConnectWhatsappInput, Problem> {
  const extra = (key: "providerRef" | "wabaId" | "phoneNumberId" | "note") => {
    const text = optional(values[key]);
    return "value" in text ? { [key]: text.value } : {};
  };
  return checked(
    connectWhatsappInput.safeParse({
      organizationId,
      displayNumber: values.displayNumber,
      integratedNumber: values.integratedNumber.replace(/\D/g, ""),
      mode: values.mode,
      ...extra("providerRef"),
      ...extra("wabaId"),
      ...extra("phoneNumberId"),
      ...extra("note"),
    }),
    values,
    ([key]) => (typeof key === "string" && key in values ? key : undefined),
    () => "invalid",
  );
}

function Form({
  formId,
  organizationId,
  sending,
}: {
  formId: string;
  organizationId: string;
  sending: Sending<ConnectWhatsappInput>;
}) {
  const t = useTranslations("consoleWhatsapp.connect");
  const tProblems = useTranslations("consoleWhatsapp.connect.problems");
  const { form, onSubmit, formProblem } = useCheckedForm<ConnectValues, ConnectWhatsappInput, Problem>(
    {
      displayNumber: "",
      integratedNumber: "",
      mode: "new_number",
      providerRef: "",
      wabaId: "",
      phoneNumberId: "",
      note: "",
    },
    (values) => check(organizationId, values),
    (problem) => tProblems(problem),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(sending.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <PhoneField control={form.control} name="displayNumber" label={t("displayNumber")} />
        <TextField
          control={form.control}
          name="integratedNumber"
          label={t("integratedNumber")}
          hint={t("integratedHint")}
          inputMode="numeric"
          autoComplete="off"
        />
        <ChoiceField
          control={form.control}
          name="mode"
          legend={t("mode")}
          options={[
            { value: "new_number", label: t("modeNew") },
            { value: "coexistence", label: t("modeCoexistence") },
          ]}
        />
        <TextField control={form.control} name="providerRef" label={t("providerRef")} autoComplete="off" />
        <TextField control={form.control} name="wabaId" label={t("wabaId")} autoComplete="off" />
        <TextField control={form.control} name="phoneNumberId" label={t("phoneNumberId")} autoComplete="off" />
        <TextField control={form.control} name="note" label={t("note")} autoComplete="off" />
      </FieldGroup>
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function ConnectDialog({ organizationId }: { organizationId: string }) {
  const t = useTranslations("consoleWhatsapp.connect");
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const dialog = useFormDialog(t("done"), () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: trpc.whatsapp.pathKey() })]),
  );
  const connect = useMutation(trpc.whatsapp.connect.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      dialog={dialog}
      sending={connect}
      trigger={{ label: t("title"), variant: "default" }}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <Form formId={formId} organizationId={organizationId} sending={connect} />}
    </FormDialog>
  );
}
