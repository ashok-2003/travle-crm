"use client";

// Merging a destination into another (spec 3.6, R34): the dialog asks which to keep, found by searching the agency's
// whole list (DestinationPicker, without the one being merged), and says what merging does before anything is sent:
// its leads move to the one kept, it leaves the list, and its name finds the kept one from then on. The last step is
// destructive and holds while it is out (rule 7); once merged, it says how many leads moved to which destination, and
// the list and the leads load again.
import type { Destination, MergeDestinationsInput } from "@travel-crm/contracts/catalog";
import { mergeDestinationsInput } from "@travel-crm/contracts/catalog";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { checked, type Checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, type Sending } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPCClient } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { DestinationPicker } from "./destination-picker";

interface MergeValues {
  keep: Destination | null;
}

/** What the form sends: the api's input, and the kept destination's name for saying what happened. */
interface Merge {
  input: MergeDestinationsInput;
  keptName: string;
}

function toMerge(destinationId: string, values: MergeValues): Checked<MergeValues, Merge, "keep" | "required"> {
  const result = checked(
    mergeDestinationsInput.safeParse({ destinationId, intoDestinationId: values.keep?.id ?? "" }),
    values,
    ([key]) => (key === "intoDestinationId" ? "keep" : undefined),
    () => "keep",
    values.keep === null ? { keep: "required" } : {},
  );
  return result.ok ? { ok: true, input: { input: result.input, keptName: values.keep?.name ?? "" } } : result;
}

function MergeForm({
  formId,
  destination,
  merge,
}: {
  formId: string;
  destination: Destination;
  merge: Sending<Merge>;
}) {
  const t = useTranslations("settings.destinations.merge");
  const { form, onSubmit, formProblem } = useCheckedForm<MergeValues, Merge, "keep" | "required">(
    { keep: null },
    (values) => toMerge(destination.id, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(merge.mutate)} className="flex flex-col gap-4">
      <Controller
        control={form.control}
        name="keep"
        render={({ field, fieldState }) => (
          <FormField label={t("keep")} error={fieldState.error?.message}>
            {(links) => (
              <DestinationPicker links={links} value={field.value} onChange={field.onChange} without={destination.id} />
            )}
          </FormField>
        )}
      />
      <FormAlert sending={merge} problem={formProblem} />
    </form>
  );
}

export function MergeDestinationsDialog({
  destination,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  destination: Destination;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("settings.destinations.merge");
  const client = useTRPCClient();
  const refresh = useRefreshWork();
  const merge = useMutation({
    mutationFn: ({ input }: Merge) => client.destinations.merge.mutate(input),
    onSuccess: async ({ leadsMoved }, { keptName }) => {
      await refresh();
      toast.success(t("done", { count: leadsMoved, name: keptName }));
      onOpenChange(false);
    },
  });
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={{ open, setOpen: onOpenChange }}
      sending={merge}
      title={t("title", { name: destination.name })}
      description={t("description", { name: destination.name })}
      submit={t("submit")}
      submitting={t("submitting")}
      destructive
    >
      {(formId) => <MergeForm formId={formId} destination={destination} merge={merge} />}
    </FormDialog>
  );
}
