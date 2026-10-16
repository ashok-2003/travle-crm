"use client";

// Correcting an organization's row (organizations.update): its name, time zone and contact email, checked by the api's
// own schema first. Saved, the organization's page and the dashboard load it again; a refusal shows its sentence in
// the dialog, keeping what was typed.
import type { OrganizationRecord, UpdateOrganizationInput } from "@travel-crm/contracts/platform";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FieldGroup } from "@/components/ui/field";
import { useConsoleTRPC } from "../../data/console-trpc";
import { ChangeDialog, FormFooter, useChangeDialog, type Sending } from "../change-dialog";
import { useCheckedForm } from "../fields/checked-form";
import { TimeZoneField } from "../fields/zone-and-state-fields";
import { toUpdateInput } from "./record-values";

export function CorrectRecordDialog({ organization }: { organization: OrganizationRecord }) {
  const t = useTranslations("consoleOrganizations.record");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(organization.id, t("saved"));
  const update = useMutation(trpc.organizations.update.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <ChangeDialog
      dialog={dialog}
      sending={update}
      label={t("correct")}
      title={t("dialogTitle")}
      description={t("dialogDescription")}
    >
      <CorrectRecordForm organization={organization} update={update} />
    </ChangeDialog>
  );
}

function CorrectRecordForm({
  organization,
  update,
}: {
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
    <form noValidate onSubmit={onSubmit(update.mutate)} className="flex flex-col gap-6">
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
      <FormFooter sending={update} problem={formProblem} label={t("save")} pendingLabel={t("saving")} />
    </form>
  );
}
