"use client";

// Removing the logo, asked once more: documents issued from now on have none, while those already issued keep theirs.
import type { OrganizationLogo } from "@travel-crm/contracts/profile";
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
import { useRemoveLogo } from "./use-logo";

export function RemoveLogoDialog({
  logo,
  open,
  onOpenChange,
}: {
  logo: OrganizationLogo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("documents.branding.logo");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const remove = useRemoveLogo();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) remove.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(remove.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
            className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
            disabled={remove.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              remove.mutate(
                { attachmentId: logo.attachmentId },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {t("removeConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
