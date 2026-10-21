"use client";

// The same follow-up on each chosen lead (release C), for each lead's owner, due at the same time: the one follow-up
// form (add-follow-up-dialog.tsx) with the bulk change's input. Held while the request is out.
import { bulkAddWorkInput, type BulkAddWorkInput, type BulkResult } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { FormDialog } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPC } from "@/data/trpc";
import { followUpInput, FollowUpForm } from "../../lead/add-follow-up-dialog";

export function BulkFollowUpDialog({
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
  const t = useTranslations("leads.bulk.work");
  const trpc = useTRPC();
  const add = useMutation(
    trpc.leads.bulkAddWork.mutationOptions({
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
      sending={add}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => (
        <FollowUpForm<BulkAddWorkInput>
          formId={formId}
          toInput={(values) => followUpInput(bulkAddWorkInput, { leadIds }, values)}
          add={add}
        />
      )}
    </FormDialog>
  );
}
