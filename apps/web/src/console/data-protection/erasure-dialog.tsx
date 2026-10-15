"use client";

// The last step of an erasure: the organization's code typed to confirm, then the request, which the console's job
// carries out once it has checked again. A refusal shows its sentence (remove them first, export them first, a
// record the law keeps or that holds no one's data).
import type { ErasureSubject, QueuedJob } from "@travel-crm/contracts/platform";
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
import { useErrorMessage } from "@/lib/error-message";
import { useConsoleTRPC } from "../data/console-trpc";
import { TypedConfirmation } from "./typed-confirmation";

export function ErasureDialog({
  organization,
  subject,
  open,
  onOpenChange,
  onQueued,
}: {
  organization: { id: string; code: string };
  subject: ErasureSubject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQueued: (job: QueuedJob) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.subject");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const trpc = useConsoleTRPC();
  const erase = useMutation(trpc.dataProtection.requestErasure.mutationOptions());
  const [typed, setTyped] = useState("");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("eraseTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("eraseDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <TypedConfirmation code={organization.code} value={typed} onChange={setTyped} />
        {erase.isError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(erase.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
            className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
            disabled={typed !== organization.code || erase.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              erase.mutate(
                { organizationId: organization.id, subject, confirmation: typed },
                {
                  onSuccess: (job) => {
                    onQueued(job);
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {t("confirmErase")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
