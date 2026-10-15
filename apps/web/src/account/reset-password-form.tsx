"use client";

// Choosing a new password from the emailed link. Better Auth opened the link, checked it and sent the browser here
// with ?token=, or with ?error=INVALID_TOKEN when it had expired or been used. A reset signs the person out
// everywhere (plan 3, Task I3), so this device forgets their data, the app's other tabs are told, and they sign in
// again with the new password.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { announceSignOut, wipeLocalData } from "@/data/session";
import { routes } from "@/lib/routes";
import { OutcomeMessage } from "./outcome-message";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFormResolver } from "./form-errors";
import { useNewPasswordSchema } from "./new-password-schema";
import { TextField } from "./text-field";

const noOtherFields = {};

export function ResetPasswordForm({
  token,
  auth = authClient,
}: {
  /** The token from the link, or null when Better Auth found the link expired or used. */
  token: string | null;
  auth?: Pick<AuthClient, "resetPassword">;
}) {
  const t = useTranslations("account");
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<"form" | "done" | "invalid">(token === null ? "invalid" : "form");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const schema = useNewPasswordSchema(noOtherFields);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: useFormResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const submit = form.handleSubmit(async ({ newPassword: chosen }) => {
    if (token === null) return;
    setFailure(null);
    const result = await auth.resetPassword({ token, newPassword: chosen });
    if (result.ok) {
      try {
        await wipeLocalData(queryClient);
      } catch {
        // Storage that refuses the wipe still leaves the person needing to know that their password changed.
      }
      announceSignOut();
      setOutcome("done");
    } else if (result.code === "INVALID_TOKEN") setOutcome("invalid");
    else setFailure(result);
  });

  if (outcome === "invalid") {
    return (
      <div className="flex flex-col gap-5">
        <OutcomeMessage variant="destructive">{t("resetPassword.invalidLink")}</OutcomeMessage>
        <Button asChild>
          <Link href={routes.forgotPassword}>{t("resetPassword.askAgain")}</Link>
        </Button>
      </div>
    );
  }
  if (outcome === "done") {
    return (
      <div className="flex flex-col gap-5">
        <OutcomeMessage>{t("resetPassword.done")}</OutcomeMessage>
        <Button asChild>
          <Link href={routes.signIn}>{t("resetPassword.signIn")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="newPassword"
          label={t("fields.newPassword")}
          hint={t("fields.newPasswordHint")}
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirmPassword"
          label={t("fields.confirmPassword")}
          type="password"
          autoComplete="new-password"
        />
      </FieldGroup>
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </Button>
    </form>
  );
}
