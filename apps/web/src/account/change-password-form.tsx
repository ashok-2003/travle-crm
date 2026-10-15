"use client";

// Choosing a new password: the current one (or the temporary one an admin gave), and the new one twice. Better Auth
// checks the current password; the api's hook refuses a "new" password equal to it.
import { passwordAttempt } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { OutcomeMessage } from "./outcome-message";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFormResolver } from "./form-errors";
import { useNewPasswordSchema } from "./new-password-schema";
import { TextField } from "./text-field";

const currentPasswordField = { currentPassword: passwordAttempt };

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
  const tCommon = useTranslations("common");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  // The new password is saved but the next screen didn't open (me.get unreachable). The form, whose current password
  // is now wrong, never comes back; only a way on does.
  const [savedOnly, setSavedOnly] = useState(false);
  const [goingOn, setGoingOn] = useState(false);
  const schema = useNewPasswordSchema(currentPasswordField);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: useFormResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const goOn = async () => {
    setGoingOn(true);
    try {
      await onChanged();
    } catch {
      setSavedOnly(true);
    } finally {
      setGoingOn(false);
    }
  };

  const submit = form.handleSubmit(async ({ currentPassword, newPassword: chosen }) => {
    setFailure(null);
    const result = await auth.changePassword({ currentPassword, newPassword: chosen });
    if (result.ok) await goOn();
    else setFailure(result);
  });

  if (savedOnly) {
    return (
      <div className="flex flex-col gap-5">
        <OutcomeMessage>{t("changePassword.savedNotContinued")}</OutcomeMessage>
        <Button disabled={goingOn} onClick={() => void goOn()}>
          {goingOn && <Spinner />}
          {tCommon("continue")}
        </Button>
      </div>
    );
  }
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
