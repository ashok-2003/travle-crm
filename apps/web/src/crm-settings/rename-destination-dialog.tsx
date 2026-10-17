"use client";

// Renaming a destination (spec 3.6): its name, checked by the api's own schema (trimmed, 1 to 80 characters) before it
// is sent. A name another destination has, or one the api finds empty or too long, is said on the name field. Holds
// while the request is out (rule 7); once renamed, the list and the leads load again.
import type { Destination } from "@travel-crm/contracts/catalog";
import { renameDestinationInput, type RenameDestinationInput } from "@travel-crm/contracts/catalog";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type Sending } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useTRPC } from "@/data/trpc";
import { useRefusalOnField } from "@/today/use-refusal-on-field";
import { useRefreshDestinations } from "./use-destinations";

interface RenameValues {
  name: string;
}

function RenameForm({
  formId,
  destination,
  rename,
}: {
  formId: string;
  destination: Destination;
  rename: Sending<RenameDestinationInput>;
}) {
  const t = useTranslations("settings.destinations.rename");
  const { form, onSubmit, formProblem } = useCheckedForm<RenameValues, RenameDestinationInput, "name" | "required">(
    { name: destination.name },
    (values) =>
      checked(
        renameDestinationInput.safeParse({ destinationId: destination.id, name: values.name }),
        values,
        ([key]) => (key === "name" ? "name" : undefined),
        () => "name",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const refusal = useRefusalOnField(form, rename.error, {
    DESTINATION_NAME_TAKEN: "name",
    INVALID_DESTINATION_NAME: "name",
  });
  return (
    <form id={formId} noValidate onSubmit={onSubmit(rename.mutate)} className="flex flex-col gap-4">
      <TextField control={form.control} name="name" label={t("name")} autoComplete="off" />
      <FormAlert sending={{ error: refusal }} problem={formProblem} />
    </form>
  );
}

export function RenameDestinationDialog({
  destination,
  open,
  onOpenChange,
}: {
  destination: Destination;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.destinations.rename");
  const trpc = useTRPC();
  const refresh = useRefreshDestinations();
  const dialog = useFormDialog(t("done"), refresh, { open, setOpen: onOpenChange });
  const rename = useMutation(trpc.destinations.rename.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      dialog={dialog}
      sending={rename}
      title={t("title", { name: destination.name })}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <RenameForm formId={formId} destination={destination} rename={rename} />}
    </FormDialog>
  );
}
