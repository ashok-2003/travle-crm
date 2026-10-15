"use client";

// The last step of a deletion for good: the organization's code typed to confirm, then the request, which the
// console's job carries out once it has checked everything again. A refusal shows its sentence; a missing export
// gets the deletion's own (the api's EXPORT_FIRST is worded for an erasure).
import type { QueuedJob } from "@travel-crm/contracts/platform";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { refusalOf } from "@/data/api-error";
import { useErrorMessage } from "@/lib/error-message";
import { useConsoleTRPC } from "../data/console-trpc";
import { TypedConfirmation } from "./typed-confirmation";

export function PurgeDialog({
  organization,
  open,
  onOpenChange,
  onQueued,
}: {
  organization: { id: string; name: string; code: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQueued: (job: QueuedJob) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.purge");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const trpc = useConsoleTRPC();
  const purge = useMutation(trpc.dataProtection.requestPurge.mutationOptions());
  const [typed, setTyped] = useState("");
  const refusal = purge.isError
    ? refusalOf(purge.error)?.reason === "EXPORT_FIRST"
      ? t("notExported")
      : apiError(purge.error)
    : null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle", { name: organization.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <TypedConfirmation code={organization.code} value={typed} onChange={setTyped} />
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
            className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
            disabled={typed !== organization.code || purge.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              purge.mutate(
                { organizationId: organization.id, confirmation: typed },
                {
                  onSuccess: (job) => {
                    onQueued(job);
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
