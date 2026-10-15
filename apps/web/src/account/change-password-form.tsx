"use client";

// Choosing a new password: the current one (or the temporary one an admin gave), and the new one twice. Better Auth
// checks the current password; the api's hook refuses a "new" password equal to it.
import { zodResolver } from "@hookform/resolvers/zod";
import { newPassword, passwordAttempt } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFieldErrorMessages } from "./form-errors";
import { TextField } from "./text-field";

export function ChangePasswordForm({
  temporary,
  onChanged,
  auth = authClient,
}: {
  /** The current password is the temporary one an admin set. */
  temporary: boolean;
  onChanged: () => Promise<void> | void;
  auth?: Pick<AuthClient, "changePassword">;
}) {
  const t = useTranslations("account");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const errorMessages = useFieldErrorMessages();
  const schema = useMemo(
    () =>
      z
        .strictObject({ currentPassword: passwordAttempt, newPassword, confirmPassword: z.string() })
        .refine((values) => values.newPassword === values.confirmPassword, {
          message: t("fields.passwordsDiffer"),
          path: ["confirmPassword"],
        }),
    [t],
  );
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema, { error: errorMessages }),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const submit = form.handleSubmit(async ({ currentPassword, newPassword: chosen }) => {
    setFailure(null);
    const result = await auth.changePassword({ currentPassword, newPassword: chosen });
    if (result.ok) await onChanged();
    else setFailure(result);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <FieldGroup>
        <TextField
          control={form.control}
          name="currentPassword"
          label={temporary ? t("fields.temporaryPassword") : t("fields.currentPassword")}
          type="password"
          autoComplete="current-password"
        />
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
        {form.formState.isSubmitting ? t("changePassword.submitting") : t("changePassword.submit")}
      </Button>
    </form>
  );
}
