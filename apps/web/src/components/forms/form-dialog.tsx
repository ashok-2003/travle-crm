"use client";

// A form in a dialog (a sheet on phones) that owns its mutation, on ResponsiveDialog: the form is the body, mounted
// only while open so each opening starts afresh, and the footer holds Cancel and the submit button, which sends the
// form through its id. The mutation lives with the dialog, not the form, so what follows success lands even once the
// form is gone: `refresh` awaited (the queries to load again), a toast saying `done`, the dialog closed. While the
// request is out the dialog is `busy`: nothing closes it, and the submit button shows it is sending. Closed by the
// person, it forgets the last try's refusal. FormAlert, at the end of the form, shows the form's own problem
// (useCheckedForm's formProblem) or else the api's refusal.
//
//   const dialog = useFormDialog(t("done"), () => queryClient.invalidateQueries({ queryKey }));
//   const save = useMutation(trpc.things.save.mutationOptions({ onSuccess: dialog.onSuccess }));
//   <FormDialog dialog={dialog} sending={save} trigger={{ label: t("action") }} title={t("title")}
//     description={t("description")} submit={t("submit")} submitting={t("submitting")}>
//     {(formId) => <ThingForm formId={formId} save={save} />}
//   </FormDialog>
//
// and ThingForm is <form id={formId} noValidate onSubmit={onSubmit(save.mutate)}>…<FormAlert sending={save}
// problem={formProblem} /></form>. A dialog opened from elsewhere (one item of a menu) has no trigger: give
// useFormDialog the open state held where the menu is.
import { CircleAlertIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** What a form dialog and its form use of the mutation (useMutation's result). */
export interface Sending<Input> {
  mutate: (input: Input) => void;
  isPending: boolean;
  error: unknown;
  reset: () => void;
}

/** Whether a dialog is open, and how to open or close it. */
export interface OpenState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * A form dialog's open state (its own, or `held` higher up), and its mutation's onSuccess: `refresh` awaited, `done`
 * said, the dialog closed.
 */
export function useFormDialog(
  done: string,
  refresh: () => Promise<unknown> = () => Promise.resolve(),
  held?: OpenState,
) {
  const [ownOpen, setOwnOpen] = useState(false);
  const { open, setOpen } = held ?? { open: ownOpen, setOpen: setOwnOpen };
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
  trigger,
  title,
  description,
  submit,
  submitting,
  destructive = false,
  canSubmit = true,
  children,
}: {
  dialog: OpenState;
  sending: Pick<Sending<never>, "isPending" | "reset">;
  /** The button that opens it, unless something else does (a menu's item). */
  trigger?: {
    label: string;
    /** A fuller name where the words alone are ambiguous (one in each row of a list). */
    accessibleLabel?: string;
    /** Outline by default; "default" for the region's one primary action, "destructive" for one that ends access. */
    variant?: "default" | "outline" | "destructive";
  };
  title: string;
  description: string;
  /** The submit button's words, and its words while sending. */
  submit: string;
  submitting: string;
  /** The submit button as a destructive change's last step. */
  destructive?: boolean;
  /** False while the form can't be sent yet (what it needs is loading). */
  canSubmit?: boolean;
  /** The form, given the id the submit button sends it by, mounted while the dialog is open. */
  children: (formId: string) => ReactNode;
}) {
  const formId = useId();
  return (
    <>
      {trigger && (
        <Button
          variant={trigger.variant ?? "outline"}
          aria-label={trigger.accessibleLabel}
          onClick={() => {
            dialog.setOpen(true);
          }}
        >
          {trigger.label}
        </Button>
      )}
      <ResponsiveDialog
        open={dialog.open}
        onOpenChange={(open) => {
          // A refusal from this try isn't the next one's.
          if (!open) sending.reset();
          dialog.setOpen(open);
        }}
        busy={sending.isPending}
        title={title}
        description={description}
        footer={
          <Button
            type="submit"
            form={formId}
            variant={destructive ? "destructive" : "default"}
            disabled={sending.isPending || !canSubmit}
          >
            {sending.isPending && <Spinner />}
            {sending.isPending ? submitting : submit}
          </Button>
        }
      >
        {dialog.open && children(formId)}
      </ResponsiveDialog>
    </>
  );
}

/** At the end of the form: its own problem (useCheckedForm's formProblem), or else the api's refusal, if any. */
export function FormAlert({
  sending,
  problem,
}: {
  sending: Pick<Sending<never>, "error">;
  problem: string | undefined;
}) {
  if (problem === undefined) return <RefusalAlert error={sending.error} />;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription>{problem}</AlertDescription>
    </Alert>
  );
}
