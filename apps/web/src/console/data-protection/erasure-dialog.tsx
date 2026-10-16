"use client";

// The last step of an erasure: the organization's code typed to confirm, then the request (made by the section, whose
// own handling of the answer survives this dialog closing), which the console's job carries out once it has checked
// again. The dialog can't be closed while the request is out. A refusal shows its sentence (remove them first, export
// them first, a record the law keeps or that holds no one's data).
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
import { TypedConfirmation } from "./typed-confirmation";

export function ErasureDialog({
  code,
  open,
  onOpenChange,
  pending,
  error,
  onConfirm,
}: {
  /** The organization's code, which is typed to confirm. */
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** What the api refused with, if it did. */
  error: unknown;
  onConfirm: (confirmation: string) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.subject");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const [typed, setTyped] = useState("");
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("eraseTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("eraseDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <TypedConfirmation code={code} value={typed} onChange={setTyped} />
        {Boolean(error) && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={typed !== code || pending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              onConfirm(typed);
            }}
          >
            {t("confirmErase")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
