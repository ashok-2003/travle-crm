"use client";

// Asking once more before something that can't be taken back (DESIGN.md section 6): what happens, anything more the
// person must do first (children: say, the code typed to confirm, with confirmDisabled until it matches), a refusal's
// sentence if the api gave one, then Cancel and the action: destructive, unless the section says the action takes
// nothing away ("Add 12 people?", W13). While its request is out the dialog stays open: Cancel and the action are off
// and Escape does nothing, so the answer is always seen.
//
// The one way it closes on success (Ruling P): the section that opens it owns the request, and closes it in that
// mutation's own options, the hook's useMutation onSuccess (as useRemoveLogo(onRemoved) does), never in mutate()'s
// callbacks, which are dropped once the calling component is gone. Closed by the person (Cancel, Escape), the request
// is reset, so its refusal isn't shown when the dialog opens again; a success has none to forget. Closed either way, it
// gives the focus back to `returnFocusTo`, the button that opened it (return-focus.ts).
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
import { focusBackTo, type ReturnFocusTo } from "./return-focus";

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
  confirmDisabled = false,
  destructive = true,
  refusal,
  returnFocusTo,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The action's button, such as "Remove the logo". */
  action: string;
  request: ConfirmRequest;
  onConfirm: () => void;
  /** The action waits for something the children ask, such as the typed code matching. */
  confirmDisabled?: boolean;
  /** The action takes something away (the default), so its button is the destructive one. */
  destructive?: boolean | undefined;
  /** The refusal's sentence where the api's own isn't the one to show; by default, the api's. */
  refusal?: ((error: unknown) => string) | undefined;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo?: ReturnFocusTo | undefined;
  children?: ReactNode;
}) {
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const sentenceFor = refusal ?? apiError;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (request.isPending) return;
        if (!next) request.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent onCloseAutoFocus={focusBackTo(returnFocusTo)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {request.isError && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{sentenceFor(request.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={request.isPending}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={confirmDisabled || request.isPending}
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
