"use client";

// Asking once more before something that can't be taken back (DESIGN.md section 6): what happens, a refusal's
// sentence if the api gave one, then Cancel and the action. While its request is out the dialog stays open: Cancel and
// the action are off and Escape does nothing, so the answer is always seen. The request belongs to the section that
// opens the dialog, whose mutation options close it on success, so the success is handled however the dialog ends.
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

/** The dialog's request: a mutation, as useMutation returns it. */
interface ConfirmRequest {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  reset: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  request,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The action's button, such as "Remove the logo". */
  action: string;
  request: ConfirmRequest;
  onConfirm: () => void;
}) {
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (request.isPending) return;
        // Opened again, it starts without the last refusal.
        if (!next) request.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {request.isError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(request.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={request.isPending}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={request.isPending}
            onClick={(event) => {
              // Open until the api answers, so a refusal shows here and the action can't be sent twice.
              event.preventDefault();
              onConfirm();
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
