"use client";

// Archiving a plan, asked once more: nothing un-archives a plan, and no organization can be put on it afterwards.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useArchivePlan } from "./use-plans";

export function ArchivePlanDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan: PlanSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consolePlatform.plans");
  const archive = useArchivePlan(() => {
    onOpenChange(false);
  });
  return (
    <ConfirmDialog
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
