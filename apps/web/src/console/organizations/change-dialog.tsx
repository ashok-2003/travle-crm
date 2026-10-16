"use client";

// What every change to an organization shares: a button that opens its form in a dialog (a sheet on phones), the form
// mounted while open so it starts from the organization as it is. The change's mutation belongs to the dialog, not
// the form, so what follows success lands even once the form is gone: the organization's page and the dashboard load
// again, a toast says what changed, the dialog closes. While the change is being sent the dialog stays open, so its
// answer is seen; a refusal shows as a sentence above the button, keeping what was typed.
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { ResponsiveDialog } from "@/organization/responsive-dialog";
import { useConsoleTRPC } from "../data/console-trpc";

/** What a change's form and dialog use of its mutation (useMutation's result). */
export interface Sending<Input> {
  mutate: (input: Input) => void;
  isPending: boolean;
  error: unknown;
  reset: () => void;
}

/** A change dialog's open state, and its mutation's onSuccess: the organization loaded again, `done` said, closed. */
export function useChangeDialog(organizationId: string, done: string) {
  const queryClient = useQueryClient();
  const trpc = useConsoleTRPC();
  const [open, setOpen] = useState(false);
  const onSuccess = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.organizations.get.queryKey({ organizationId }) }),
      queryClient.invalidateQueries({ queryKey: trpc.dashboard.organizations.pathKey() }),
    ]);
    toast.success(done);
    setOpen(false);
  }, [queryClient, trpc, organizationId, done]);
  return { open, setOpen, onSuccess };
}

export function ChangeDialog({
  dialog,
  sending,
  label,
  accessibleLabel,
  title,
  description,
  primary = false,
  children,
}: {
  dialog: ReturnType<typeof useChangeDialog>;
  sending: Pick<Sending<never>, "isPending" | "reset">;
  label: string;
  /** A fuller name for the button where its words alone are ambiguous (one in each row of a list). */
  accessibleLabel?: string;
  title: string;
  description: string;
  /** The section's one primary action (DESIGN.md: one primary per region). */
  primary?: boolean;
  /** The form, mounted while the dialog is open. */
  children: ReactNode;
}) {
  return (
    <>
      <Button
        variant={primary ? "default" : "outline"}
        aria-label={accessibleLabel}
        onClick={() => {
          // A refusal from an earlier try isn't this one's.
          sending.reset();
          dialog.setOpen(true);
        }}
      >
        {label}
      </Button>
      <ResponsiveDialog
        open={dialog.open}
        onOpenChange={(open) => {
          if (!sending.isPending) dialog.setOpen(open);
        }}
        title={title}
        description={description}
      >
        {dialog.open && children}
      </ResponsiveDialog>
    </>
  );
}

/** The refusal, if any, and the button that sends the form; the destructive variant as a change's last step. */
export function FormFooter({
  sending,
  label,
  pendingLabel,
  destructive = false,
}: {
  sending: Pick<Sending<never>, "isPending" | "error">;
  label: string;
  pendingLabel: string;
  destructive?: boolean;
}) {
  const { apiError } = useErrorMessage();
  return (
    <>
      {sending.error !== null && sending.error !== undefined && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{apiError(sending.error)}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        variant={destructive ? "destructive" : "default"}
        disabled={sending.isPending}
        className="self-end"
      >
        {sending.isPending && <Spinner />}
        {sending.isPending ? pendingLabel : label}
      </Button>
    </>
  );
}
