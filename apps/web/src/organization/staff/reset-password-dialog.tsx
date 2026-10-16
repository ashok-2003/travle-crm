"use client";

// Resetting someone's password: a new temporary one, which signs them out everywhere and which they replace at sign-in.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/lib/error-message";
import { useMe } from "@/session/me-context";
import { ResponsiveDialog } from "../responsive-dialog";
import { Handover } from "./handover";
import { handoverSignInName } from "./staff-details";
import { temporaryPassword } from "./temporary-password";
import { useResetStaffPassword } from "./use-staff";

export function ResetPasswordDialog({
  member,
  open,
  onOpenChange,
}: {
  member: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff");
  const me = useMe();
  const { apiError } = useErrorMessage();
  const [password, setPassword] = useState(temporaryPassword);
  const reset = useResetStaffPassword();
  const changeOpen = (next: boolean) => {
    // The new password is in the call's variables: let go of it when the dialog closes.
    if (!next) reset.reset();
    onOpenChange(next);
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      busy={reset.isPending}
      title={t("resetPassword.title", { name: member.name })}
      description={t("resetPassword.description")}
    >
      {reset.isSuccess ? (
        <div className="flex flex-col gap-6">
          <Handover
            name={member.name}
            organizationCode={member.username === null ? null : me.organization.code}
            signInName={handoverSignInName(member)}
            password={password}
          />
          <Button
            className="self-end"
            onClick={() => {
              changeOpen(false);
            }}
          >
            {t("create.done")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            reset.mutate({ memberId: member.memberId, temporaryPassword: password });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`reset-${member.memberId}`}>{t("create.temporaryPassword")}</FieldLabel>
            <Input
              id={`reset-${member.memberId}`}
              className="numbers"
              value={password}
              minLength={10}
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>
          {reset.isError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError(reset.error)}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={reset.isPending || password.length < 10} className="self-end">
            {reset.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
          </Button>
        </form>
      )}
    </ResponsiveDialog>
  );
}
