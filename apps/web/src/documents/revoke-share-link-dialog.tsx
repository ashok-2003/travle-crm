"use client";

// Turning a link off, asked once more: whoever has it can no longer open the document, and it can't be undone.
import type { ShareLinkSummary } from "@travel-crm/contracts/share-links";
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
import { useRevokeShareLink } from "./use-share-links";

export function RevokeShareLinkDialog({
  link,
  open,
  onOpenChange,
}: {
  link: ShareLinkSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("documents.share");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const revoke = useRevokeShareLink();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) revoke.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("revokeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {revoke.isError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(revoke.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
            className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
            disabled={revoke.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              revoke.mutate(
                { shareLinkId: link.id },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {t("revokeConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
