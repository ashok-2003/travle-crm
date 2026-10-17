"use client";

// A new temporary password for someone of the platform staff: it signs them out everywhere and ends the impersonations
// they started, and they replace it at their next sign-in. The api makes it; it is shown this once, and let go of when
// the dialog closes. While the request is out nothing closes the dialog.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ReturnFocusTo } from "@/components/return-focus";
import { PasswordHandover } from "./password-handover";
import { useResetPlatformStaffPassword } from "./use-platform-staff";

export function ResetPasswordDialog({
  person,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  person: PlatformStaffEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consolePlatform.staff");
  const reset = useResetPlatformStaffPassword();
  const changeOpen = (next: boolean) => {
    // The new password is in the call's answer: let go of it when the dialog closes.
    if (!next) reset.reset();
    onOpenChange(next);
  };
  return (
    <ResponsiveDialog
      returnFocusTo={returnFocusTo}
      open={open}
      onOpenChange={changeOpen}
      busy={reset.isPending}
      title={t("resetPassword.title", { name: person.name })}
      description={reset.isSuccess ? t("handover.shownOnce") : t("resetPassword.description")}
      cancel={!reset.isSuccess}
      footer={
        reset.isSuccess ? (
          <Button
            onClick={() => {
              changeOpen(false);
            }}
          >
            {t("handover.done")}
          </Button>
        ) : (
          <Button
            disabled={reset.isPending}
            onClick={() => {
              reset.mutate({ userId: person.userId });
            }}
          >
            {reset.isPending && <Spinner />}
            {reset.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
          </Button>
        )
      }
    >
      {reset.isSuccess ? (
        <PasswordHandover
          email={person.email}
          password={reset.data.temporaryPassword}
          intro={t("resetPassword.done", { name: person.name })}
        />
      ) : (
        <RefusalAlert error={reset.error} />
      )}
    </ResponsiveDialog>
  );
}
