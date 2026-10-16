"use client";

// Correcting an organization's row (organizations.update): its name, time zone and contact email, checked by the api's
// own schema first. Saved, the organization's page and the dashboard load it again; a refusal shows its sentence in
// the dialog, keeping what was typed.
import type { OrganizationRecord, UpdateOrganizationInput } from "@travel-crm/contracts/platform";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FormAlert, FormDialog, type Sending } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { useChangeDialog } from "../change-dialog";
import { TimeZoneField } from "../fields/time-zone-field";
import { toUpdateInput } from "./record-values";

export function CorrectRecordDialog({ organization }: { organization: OrganizationRecord }) {
  const t = useTranslations("consoleOrganizations.record");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(organization.id, t("saved"));
  const update = useMutation(trpc.organizations.update.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      dialog={dialog}
      sending={update}
      trigger={{ label: t("correct") }}
      title={t("dialogTitle")}
      description={t("dialogDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <CorrectRecordForm formId={formId} organization={organization} update={update} />}
    </FormDialog>
  );
}

function CorrectRecordForm({
  formId,
  organization,
  update,
}: {
  formId: string;
  organization: OrganizationRecord;
  update: Sending<UpdateOrganizationInput>;
}) {
  const t = useTranslations("consoleOrganizations.record");
  const { form, onSubmit, formProblem } = useCheckedForm(
    { name: organization.name, timeZone: organization.timeZone, contactEmail: organization.contactEmail ?? "" },
    (values) => toUpdateInput(organization.id, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(update.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField control={form.control} name="name" label={t("name")} autoComplete="off" />
        <TimeZoneField control={form.control} name="timeZone" label={t("timeZone")} current={organization.timeZone} />
        <TextField
          control={form.control}
          name="contactEmail"
          label={t("contactEmail")}
          hint={t("contactEmailHint")}
          type="email"
          inputMode="email"
          autoComplete="off"
        />
      </FieldGroup>
      <FormAlert sending={update} problem={formProblem} />
    </form>
  );
}
