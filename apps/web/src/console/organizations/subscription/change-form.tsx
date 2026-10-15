"use client";

// What every subscription change shares: a button that opens its form in a dialog (a sheet on phones), mounted while
// open so it starts from the subscription as it is; the form checked before sending, problems on their fields; the
// api's refusal as a sentence above the button, keeping what was typed; and, once saved, the organization's page and
// the dashboard loaded again and a toast that says what changed.
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState, type ReactNode } from "react";
import { useForm, type DefaultValues, type FieldErrors, type FieldValues, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { ResponsiveDialog } from "@/organization/responsive-dialog";
import { useConsoleTRPC } from "../../data/console-trpc";
import type { Checked, SubscriptionProblem } from "./change-inputs";

export function ChangeDialog({
  label,
  accessibleLabel,
  title,
  description,
  primary = false,
  children,
}: {
  label: string;
  /** A fuller name for the button where its words alone are ambiguous (one in each row of a list). */
  accessibleLabel?: string;
  title: string;
  description: string;
  /** The section's one primary action (DESIGN.md: one primary per region). */
  primary?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  return (
    <>
      <Button
        variant={primary ? "default" : "outline"}
        aria-label={accessibleLabel}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={title} description={description}>
        {open && children(close)}
      </ResponsiveDialog>
    </>
  );
}

/** A form checked by `check` before it is sent: each problem's words on its field. */
export function useCheckedForm<Values extends FieldValues, Input>(
  defaultValues: DefaultValues<Values>,
  check: (values: Values) => Checked<Values, Input>,
) {
  const t = useTranslations("consoleOrganizations.subscription.problems");
  const resolver: Resolver<Values> = (values) => {
    const result = check(values);
    if (result.ok) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const [field, problem] of Object.entries<SubscriptionProblem | undefined>(result.problems)) {
      if (problem !== undefined) errors[field] = { type: "validate", message: t(problem) };
    }
    return { values: {}, errors: errors as FieldErrors<Values> };
  };
  return useForm<Values>({ resolver, defaultValues });
}

/** After a change: the organization's page and the dashboard load again, and a toast says it is done. */
export function useAfterChange(organizationId: string): (said: string) => Promise<void> {
  const queryClient = useQueryClient();
  const trpc = useConsoleTRPC();
  return useCallback(
    async (said: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.organizations.get.queryKey({ organizationId }) }),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.organizations.pathKey() }),
      ]);
      toast.success(said);
    },
    [queryClient, trpc, organizationId],
  );
}

/** The refusal, if any, and the button that sends the form; red only as a destructive change's last step. */
export function FormFooter({
  pending,
  error,
  label,
  pendingLabel,
  destructive = false,
}: {
  pending: boolean;
  error: unknown;
  label: string;
  pendingLabel: string;
  destructive?: boolean;
}) {
  const { apiError } = useErrorMessage();
  return (
    <>
      {error !== null && error !== undefined && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{apiError(error)}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        disabled={pending}
        className={cn("self-end", destructive && "bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90")}
      >
        {pending && <Spinner />}
        {pending ? pendingLabel : label}
      </Button>
    </>
  );
}
