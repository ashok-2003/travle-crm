"use client";

// A form in a dialog (a sheet on phones) that owns its mutation. Its trigger button opens it; the form (the children)
// is mounted only while open, so each opening starts afresh, and a refusal from the last try is cleared. The mutation
// lives with the dialog, not the form, so what follows success lands even once the form is gone: `refresh` awaited
// (the queries to load again), a toast saying `done`, the dialog closed. While the request is out the dialog is
// ResponsiveDialog's `busy`: nothing closes it and it shows no close button, so its answer is seen. FormFooter, at the
// end of the form, shows the form's own problem (useCheckedForm's formProblem) or else the api's refusal, then the
// submit button.
//
//   const dialog = useFormDialog(t("done"), () => queryClient.invalidateQueries({ queryKey }));
//   const save = useMutation(trpc.things.save.mutationOptions({ onSuccess: dialog.onSuccess }));
//   <FormDialog dialog={dialog} sending={save} label={t("action")} title={t("title")} description={t("description")}>
//     <ThingForm save={save} />
//   </FormDialog>
//
// and in ThingForm: <form noValidate onSubmit={onSubmit(save.mutate)}>…<FormFooter sending={save} problem={formProblem}
// label={t("submit")} pendingLabel={t("submitting")} /></form>.
import { CircleAlertIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { ResponsiveDialog } from "@/components/responsive-dialog";

/** What a form dialog and its form use of the mutation (useMutation's result). */
export interface Sending<Input> {
  mutate: (input: Input) => void;
  isPending: boolean;
  error: unknown;
  reset: () => void;
}

/** A form dialog's open state, and its mutation's onSuccess: `refresh` awaited, `done` said, the dialog closed. */
export function useFormDialog(done: string, refresh: () => Promise<unknown> = () => Promise.resolve()) {
  const [open, setOpen] = useState(false);
  const onSuccess = async () => {
    await refresh();
    toast.success(done);
    setOpen(false);
  };
  return { open, setOpen, onSuccess };
}

export function FormDialog({
  dialog,
  sending,
  label,
  accessibleLabel,
  title,
  description,
  primary = false,
  children,
}: {
  dialog: ReturnType<typeof useFormDialog>;
  sending: Pick<Sending<never>, "isPending" | "reset">;
  /** The trigger button's words. */
  label: string;
  /** A fuller name for the button where its words alone are ambiguous (one in each row of a list). */
  accessibleLabel?: string;
  title: string;
  description: string;
  /** The region's one primary action (DESIGN.md: one primary per region); otherwise an outline button. */
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
        onOpenChange={dialog.setOpen}
        busy={sending.isPending}
        title={title}
        description={description}
      >
        {dialog.open && children}
      </ResponsiveDialog>
    </>
  );
}

/**
 * The form's own problem (useCheckedForm's formProblem) or else the api's refusal, if any, and the button that sends
 * the form; the destructive variant as a destructive change's last step.
 */
export function FormFooter({
  sending,
  problem,
  label,
  pendingLabel,
  destructive = false,
}: {
  sending: Pick<Sending<never>, "isPending" | "error">;
  problem: string | undefined;
  label: string;
  pendingLabel: string;
  destructive?: boolean;
}) {
  const { apiError } = useErrorMessage();
  const said = problem ?? (sending.error === null || sending.error === undefined ? null : apiError(sending.error));
  return (
    <>
      {said !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{said}</AlertDescription>
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
