"use client";

// Choosing a new password from the emailed link. Better Auth opened the link, checked it and sent the browser here
// with ?token=, or with ?error=INVALID_TOKEN when it had expired or been used. A reset signs the person out
// everywhere (plan 3, Task I3), so they then sign in with the new password.
import { zodResolver } from "@hookform/resolvers/zod";
import { newPassword } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFieldErrorMessages } from "./form-errors";
import { TextField } from "./text-field";

export function ResetPasswordForm({
  token,
  auth = authClient,
}: {
  /** The token from the link, or null when Better Auth found the link expired or used. */
  token: string | null;
  auth?: Pick<AuthClient, "resetPassword">;
}) {
  const t = useTranslations("account");
  const [outcome, setOutcome] = useState<"form" | "done" | "invalid">(token === null ? "invalid" : "form");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const errorMessages = useFieldErrorMessages();
  const schema = useMemo(
    () =>
      z
        .strictObject({ newPassword, confirmPassword: z.string() })
        .refine((values) => values.newPassword === values.confirmPassword, {
          message: t("fields.passwordsDiffer"),
          path: ["confirmPassword"],
        }),
    [t],
  );
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: errorMessages }),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const submit = form.handleSubmit(async ({ newPassword: chosen }) => {
    if (token === null) return;
    setFailure(null);
    const result = await auth.resetPassword({ token, newPassword: chosen });
    if (result.ok) setOutcome("done");
    else if (result.code === "INVALID_TOKEN") setOutcome("invalid");
    else setFailure(result);
  });

  if (outcome === "invalid") {
    return (
      <div className="flex flex-col gap-5">
        <Alert variant="destructive">
          <AlertDescription>{t("resetPassword.invalidLink")}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href={routes.forgotPassword}>{t("resetPassword.askAgain")}</Link>
        </Button>
      </div>
    );
  }
  if (outcome === "done") {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <AlertDescription>{t("resetPassword.done")}</AlertDescription>
        </Alert>
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
