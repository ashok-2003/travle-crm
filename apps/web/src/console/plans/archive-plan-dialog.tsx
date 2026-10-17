"use client";

// Archiving a plan, asked once more: nothing un-archives a plan, and no organization can be put on it afterwards.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useArchivePlan } from "./use-plans";

export function ArchivePlanDialog({
  plan,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  plan: PlanSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consolePlatform.plans");
  const archive = useArchivePlan(() => {
    onOpenChange(false);
  });
  return (
    <ConfirmDialog
      returnFocusTo={returnFocusTo}
      open={open}
      onOpenChange={onOpenChange}
      title={t("archiveTitle", { name: plan.name })}
      description={t("archiveDescription")}
      action={t("archiveConfirm")}
      request={archive}
      onConfirm={() => {
        archive.mutate({ planId: plan.id });
      }}
    />
  );
}
