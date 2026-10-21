"use client";

// Giving the chosen leads to one person (release C, leads:assign): someone who can work leads, each lead's open
// follow-ups going with it, as a reassign of one lead does. A FormDialog: held while the request is out.
import { bulkReassignInput, type BulkReassignInput, type BulkResult } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, type Sending } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPC } from "@/data/trpc";
import { useLeadOwners } from "../../use-lead-owners";

function BulkReassignForm({
  formId,
  leadIds,
  reassign,
}: {
  formId: string;
  leadIds: string[];
  reassign: Sending<BulkReassignInput>;
}) {
  const t = useTranslations("leads.bulk.reassign");
  const tLeads = useTranslations("leads");
  const tCommon = useTranslations("common");
  const owners = useLeadOwners();
  const { form, onSubmit, formProblem } = useCheckedForm<
    { ownerUserId: string },
    BulkReassignInput,
    "required" | "owner"
  >(
    { ownerUserId: "" },
    (values) =>
      checked(
        bulkReassignInput.safeParse({ leadIds, ownerUserId: values.ownerUserId }),
        values,
        () => "ownerUserId",
        () => "owner",
      ),
    (problem) => t(`problems.${problem}`),
  );
  if (owners.isError) {
    return (
      <ErrorState
        message={tLeads("ownersFailed")}
        error={owners.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void owners.refetch()}
      />
    );
  }
  return (
    <form id={formId} noValidate onSubmit={onSubmit(reassign.mutate)} className="flex flex-col gap-4">
      <SelectField
        control={form.control}
        name="ownerUserId"
        label={t("owner")}
        placeholder={t("choose")}
        disabled={reassign.isPending}
        options={(owners.data ?? []).map((worker) => ({ value: worker.userId, label: worker.name }))}
      />
      <FormAlert sending={reassign} problem={formProblem} />
    </form>
  );
}

export function BulkReassignDialog({
  leadIds,
  open,
  onOpenChange,
  onDone,
  returnFocusTo,
}: {
  leadIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (result: BulkResult) => Promise<void>;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("leads.bulk.reassign");
  const trpc = useTRPC();
  const owners = useLeadOwners();
  const reassign = useMutation(
    trpc.leads.bulkReassign.mutationOptions({
      onSuccess: async (result) => {
        await onDone(result);
        onOpenChange(false);
      },
    }),
  );
  return (
    <FormDialog
      dialog={{ open, setOpen: onOpenChange }}
      returnFocusTo={returnFocusTo}
      sending={reassign}
      title={t("title")}
      description={t("description", { count: leadIds.length })}
      submit={t("submit")}
      submitting={t("submitting")}
      canSubmit={owners.data !== undefined}
    >
      {(formId) => <BulkReassignForm formId={formId} leadIds={leadIds} reassign={reassign} />}
    </FormDialog>
  );
}
