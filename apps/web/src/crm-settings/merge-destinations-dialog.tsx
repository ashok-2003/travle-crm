"use client";

// Merging a destination into another (spec 3.6, R34): the dialog asks which to keep, from the agency's list without the
// one being merged, and says what merging does before anything is sent: its leads move to the one kept, it leaves the
// list, and its name finds the kept one from then on. The last step is destructive and holds while it is out (rule 7);
// once merged, it says how many leads moved, and the list and the leads load again.
import type { Destination, MergeDestinationsInput } from "@travel-crm/contracts/catalog";
import { mergeDestinationsInput } from "@travel-crm/contracts/catalog";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, type Sending } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useTRPC } from "@/data/trpc";
import { useDestinations, useRefreshDestinations } from "./use-destinations";

interface MergeValues {
  /** The id of the destination to keep. */
  keep: string;
}

function MergeForm({
  formId,
  destination,
  others,
  merge,
}: {
  formId: string;
  destination: Destination;
  others: Destination[];
  merge: Sending<MergeDestinationsInput>;
}) {
  const t = useTranslations("settings.destinations.merge");
  const { form, onSubmit, formProblem } = useCheckedForm<MergeValues, MergeDestinationsInput, "keep" | "required">(
    { keep: "" },
    (values) =>
      checked(
        mergeDestinationsInput.safeParse({ destinationId: destination.id, intoDestinationId: values.keep }),
        values,
        ([key]) => (key === "intoDestinationId" ? "keep" : undefined),
        () => "keep",
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(merge.mutate)} className="flex flex-col gap-4">
      <SelectField
        control={form.control}
        name="keep"
        label={t("keep")}
        placeholder={t("choose")}
        options={others.map((other) => ({ value: other.id, label: other.name }))}
      />
      <FormAlert sending={merge} problem={formProblem} />
    </form>
  );
}

export function MergeDestinationsDialog({
  destination,
  open,
  onOpenChange,
}: {
  destination: Destination;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.destinations.merge");
  const trpc = useTRPC();
  const refresh = useRefreshDestinations();
  const listed = useDestinations();
  const others = (listed.data ?? []).filter((other) => other.id !== destination.id);
  const merge = useMutation(
    trpc.destinations.merge.mutationOptions({
      onSuccess: async ({ leadsMoved }, { intoDestinationId }) => {
        const kept = others.find((other) => other.id === intoDestinationId)?.name ?? "";
        await refresh();
        toast.success(t("done", { count: leadsMoved, name: kept }));
        onOpenChange(false);
      },
    }),
  );
  return (
    <FormDialog
      dialog={{ open, setOpen: onOpenChange }}
      sending={merge}
      title={t("title", { name: destination.name })}
      description={t("description", { name: destination.name })}
      submit={t("submit")}
      submitting={t("submitting")}
      destructive
      canSubmit={listed.data !== undefined}
    >
      {(formId) => <MergeForm formId={formId} destination={destination} others={others} merge={merge} />}
    </FormDialog>
  );
}
