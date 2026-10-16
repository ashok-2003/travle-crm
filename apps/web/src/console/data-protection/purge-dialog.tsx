"use client";

// The last step of a deletion for good: the organization's code typed to confirm, then the request (made by the
// section, whose own handling of the answer survives this dialog closing), which the console's job carries out once
// it has checked everything again. The dialog can't be closed while the request is out. A refusal shows its sentence; a
// missing export gets the deletion's own (the api's EXPORT_FIRST is worded for an erasure).
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
import { TypedConfirmation } from "./typed-confirmation";

export function PurgeDialog({
  organization,
  open,
  onOpenChange,
  pending,
  error,
  onConfirm,
}: {
  organization: { name: string; code: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** What the api refused with, if it did. */
  error: unknown;
  onConfirm: (confirmation: string) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.purge");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const [typed, setTyped] = useState("");
  const refusal = error ? (refusalOf(error)?.reason === "EXPORT_FIRST" ? t("notExported") : apiError(error)) : null;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
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
          <AlertDialogCancel disabled={pending}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={typed !== organization.code || pending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              onConfirm(typed);
            }}
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
