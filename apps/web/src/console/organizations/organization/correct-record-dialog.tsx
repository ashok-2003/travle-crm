"use client";

// Correcting an organization's row (organizations.update): its name, time zone and contact email, checked by the api's
// own schema first. Saved, the organization's page and the dashboard load it again; a refusal shows its sentence in
// the dialog, keeping what was typed.
import type { OrganizationRecord } from "@travel-crm/contracts/platform";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/account/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { ResponsiveDialog } from "@/organization/responsive-dialog";
import { useConsoleTRPC } from "../../data/console-trpc";
import { TimeZoneField } from "../fields/zone-and-state-fields";
import { toUpdateInput, type RecordField, type RecordValues } from "./record-values";

export function CorrectRecordDialog({ organization }: { organization: OrganizationRecord }) {
  const t = useTranslations("consoleOrganizations.record");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("correct")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        description={t("dialogDescription")}
      >
        {/* Mounted while open only, so it starts from the organization as it is now. */}
        {open && (
          <CorrectRecordForm
            organization={organization}
            onSaved={() => {
              setOpen(false);
            }}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}

function CorrectRecordForm({ organization, onSaved }: { organization: OrganizationRecord; onSaved: () => void }) {
  const t = useTranslations("consoleOrganizations.record");
  const { apiError } = useErrorMessage();
  const queryClient = useQueryClient();
  const trpc = useConsoleTRPC();
  const update = useMutation(
    trpc.organizations.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.organizations.get.queryKey({ organizationId: organization.id }),
          }),
          queryClient.invalidateQueries({ queryKey: trpc.dashboard.organizations.pathKey() }),
        ]);
        toast.success(t("saved"));
        onSaved();
      },
    }),
  );
  const resolver: Resolver<RecordValues> = (values) => {
    const result = toUpdateInput(organization.id, values);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<RecordValues> = {};
    for (const [field, problem] of Object.entries(result.problems)) {
      errors[field as RecordField] = { type: "validate", message: t(`problems.${problem}`) };
    }
    return { values: {}, errors };
  };
  const form = useForm<RecordValues>({
    resolver,
    defaultValues: {
      name: organization.name,
      timeZone: organization.timeZone,
      contactEmail: organization.contactEmail ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    const result = toUpdateInput(organization.id, values);
    if (result.ok) update.mutate(result.input);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
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
      {update.isError && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{apiError(update.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={update.isPending} className="self-end">
        {update.isPending && <Spinner />}
        {update.isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
