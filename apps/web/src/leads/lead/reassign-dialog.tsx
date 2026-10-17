"use client";

// Giving a lead to someone else (spec 3.4, 4, R14, R21): one of the people who can work leads (leads.owners), the
// lead's open follow-ups going with it. A FormDialog: it holds while the request is out, and a refusal (someone who
// can't work leads any more) shows its sentence in it; a list of people that didn't load says so, with Try again.
// Opened from the ⋯ menu or the owner card.
import { reassignLeadInput, type LeadDetail, type ReassignLeadInput } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, type Sending } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { SelectField } from "@/components/forms/select-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useTRPC } from "@/data/trpc";
import { useLeadOwners } from "../use-lead-owners";
import { useRefreshLeads } from "./use-lead";

interface ReassignValues {
  ownerUserId: string;
}

function ReassignForm({
  formId,
  lead,
  reassign,
}: {
  formId: string;
  lead: LeadDetail;
  reassign: Sending<ReassignLeadInput>;
}) {
  const t = useTranslations("leads.lead.reassign");
  const tCommon = useTranslations("common");
  const owners = useLeadOwners();
  const { form, onSubmit, formProblem } = useCheckedForm<ReassignValues, ReassignLeadInput, "required" | "owner">(
    { ownerUserId: lead.ownerUserId ?? "" },
    (values) =>
      checked(
        reassignLeadInput.safeParse({ leadId: lead.id, ownerUserId: values.ownerUserId }),
        values,
        () => "ownerUserId",
        () => "owner",
      ),
    (problem) => t(`problems.${problem}`),
  );
  // Without the list there is no one to choose: it says why, with Try again, and the dialog can't be sent.
  if (owners.isError) {
    return (
      <ErrorState
        message={t("ownersFailed")}
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

export function ReassignDialog({
  lead,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  lead: LeadDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it (Reassign, or the ⋯ menu's), which takes the focus back. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("leads.lead.reassign");
  const trpc = useTRPC();
  const owners = useLeadOwners();
  const refresh = useRefreshLeads();
  const reassign = useMutation(
    trpc.leads.reassign.mutationOptions({
      onSuccess: async (_, { ownerUserId }) => {
        await refresh();
        const name = owners.data?.find((worker) => worker.userId === ownerUserId)?.name;
        toast.success(name === undefined ? t("doneSomeone") : t("done", { name }));
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
      description={t("description", { name: lead.person.name })}
      submit={t("submit")}
      submitting={t("submitting")}
      canSubmit={owners.data !== undefined}
    >
      {(formId) => <ReassignForm formId={formId} lead={lead} reassign={reassign} />}
    </FormDialog>
  );
}
