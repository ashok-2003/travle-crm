"use client";

// Signing in with the organization code, a username and a password (spec 6.3), for staff with or without email.
// The code is remembered after a successful sign-in, so next time only the username and password are typed.
import { orgSignInInput } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient, type SignInOutcome } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFormResolver } from "./form-errors";
import { rememberOrganizationCode } from "./remembered-code";
import { TextField } from "./text-field";

export function CodeSignInForm({
  rememberedCode,
  onSignedIn,
  auth = authClient,
}: {
  rememberedCode: string | null;
  onSignedIn: (outcome: SignInOutcome) => Promise<void> | void;
  auth?: Pick<AuthClient, "signInWithCode">;
}) {
  const t = useTranslations("account");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const form = useForm<z.input<typeof orgSignInInput>, unknown, z.output<typeof orgSignInInput>>({
    resolver: useFormResolver(orgSignInInput),
    defaultValues: { orgCode: rememberedCode ?? "", username: "", password: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    const result = await auth.signInWithCode(values);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    rememberOrganizationCode(values.orgCode);
    await onSignedIn(result.data);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="orgCode"
          label={t("fields.organizationCode")}
          hint={t("fields.organizationCodeHint")}
          // Not "organization": the address book's company name ("Sharma Travels Pvt Ltd") is never the code, and the
          // code is remembered after the first sign-in anyway.
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="[&_input]:numbers [&_input]:uppercase"
        />
        <TextField
          control={form.control}
          name="username"
          label={t("fields.username")}
          autoComplete="username"
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
