"use client";

// Asking for a password-reset link by email (spec 6.2). The answer is the same whether or not anyone has the
// address, so the screen can't be used to find out who has an account. Staff without email ask their admin.
import { emailAddress } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { focusWhenShown } from "./focus";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFormResolver } from "./form-errors";
import { TextField } from "./text-field";

const resetRequest = z.strictObject({ email: emailAddress });

export function ForgotPasswordForm({ auth = authClient }: { auth?: Pick<AuthClient, "requestPasswordReset"> }) {
  const t = useTranslations("account.forgotPassword");
  const tFields = useTranslations("account.fields");
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const form = useForm<z.input<typeof resetRequest>, unknown, z.output<typeof resetRequest>>({
    resolver: useFormResolver(resetRequest),
    defaultValues: { email: "" },
  });

  const submit = form.handleSubmit(async ({ email }) => {
    setFailure(null);
    // The link in the email leads back here, to the reset screen, which reads the token Better Auth adds.
    const result = await auth.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}${routes.resetPassword}`,
    });
    if (result.ok) setSent(true);
    else setFailure(result);
  });

  if (sent) {
    return (
      <Alert ref={focusWhenShown} tabIndex={-1}>
        <AlertDescription>{t("sent")}</AlertDescription>
      </Alert>
    );
  }
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <TextField
        control={form.control}
        name="email"
        label={tFields("email")}
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
      />
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
