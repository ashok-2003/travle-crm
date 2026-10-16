"use client";

// A new temporary password for someone of the platform staff: it signs them out everywhere and ends the impersonations
// they started, and they replace it at their next sign-in. The api makes it; it is shown this once.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/lib/error-message";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { PasswordHandover } from "./password-handover";
import { useResetPlatformStaffPassword } from "./use-platform-staff";

export function ResetPasswordDialog({
  person,
  open,
  onOpenChange,
}: {
  person: PlatformStaffEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consolePlatform.staff");
  const { apiError } = useErrorMessage();
  const reset = useResetPlatformStaffPassword();
  const changeOpen = (next: boolean) => {
    // Closing would hide a request the api is already carrying out, and the password it answers with.
    if (reset.isPending) return;
    // The new password is in the call's answer: let go of it when the dialog closes.
    if (!next) reset.reset();
    onOpenChange(next);
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title={t("resetPassword.title", { name: person.name })}
      description={reset.isSuccess ? t("handover.shownOnce") : t("resetPassword.description")}
    >
      {reset.isSuccess ? (
        <div className="flex flex-col gap-6">
          <PasswordHandover
            email={person.email}
            password={reset.data.temporaryPassword}
            intro={t("resetPassword.done", { name: person.name })}
          />
          <Button
            className="self-end"
            onClick={() => {
              changeOpen(false);
            }}
          >
            {t("handover.done")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {reset.isError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError(reset.error)}</AlertDescription>
            </Alert>
          )}
          <Button
            className="self-end"
            disabled={reset.isPending}
            onClick={() => {
              reset.mutate({ userId: person.userId });
            }}
          >
            {reset.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
