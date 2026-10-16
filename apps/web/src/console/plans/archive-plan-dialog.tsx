"use client";

// Archiving a plan, asked once more: nothing un-archives a plan, and no organization can be put on it afterwards.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useErrorMessage } from "@/lib/error-message";
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
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const archive = useArchivePlan();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!archive.isPending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveTitle", { name: plan.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("archiveDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {archive.isError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(archive.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archive.isPending}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={archive.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              archive.mutate(
                { planId: plan.id },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {t("archiveConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
