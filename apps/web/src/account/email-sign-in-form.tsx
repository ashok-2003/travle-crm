"use client";

// Signing in with an email and password (spec 6.3), checked with the same field rules the api uses.
import { emailAddress, passwordAttempt } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient, type SignInOutcome } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFormResolver } from "./form-errors";
import { TextField } from "./text-field";

const emailSignIn = z.strictObject({ email: emailAddress, password: passwordAttempt });

export function EmailSignInForm({
  onSignedIn,
  auth = authClient,
}: {
  onSignedIn: (outcome: SignInOutcome) => Promise<void> | void;
  auth?: Pick<AuthClient, "signInWithEmail">;
}) {
  const t = useTranslations("account");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const form = useForm<z.input<typeof emailSignIn>, unknown, z.output<typeof emailSignIn>>({
    resolver: useFormResolver(emailSignIn),
    defaultValues: { email: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    const result = await auth.signInWithEmail(values);
    if (result.ok) await onSignedIn(result.data);
    else setFailure(result);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="email"
          label={t("fields.email")}
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={form.control}
          name="password"
          label={t("fields.password")}
          type="password"
          autoComplete="current-password"
        />
      </FieldGroup>
      <AuthFailureAlert failure={failure} />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        {form.formState.isSubmitting ? t("signIn.submitting") : t("signIn.submit")}
      </Button>
    </form>
  );
}
