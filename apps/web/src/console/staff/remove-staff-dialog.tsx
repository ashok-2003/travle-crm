"use client";

// Removing someone from the platform staff (ADR 0019), asked once more: they are signed out at once, the
// impersonations they started end, and their address stays taken. The api keeps the last super admin.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useErrorMessage } from "@/lib/error-message";
import { useRemovePlatformStaff } from "./use-platform-staff";

export function RemoveStaffDialog({
  person,
  open,
  onOpenChange,
}: {
  person: PlatformStaffEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consolePlatform.staff.remove");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const remove = useRemovePlatformStaff(person.name);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!remove.isPending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name: person.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(remove.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so a refusal is shown here and the button can't be pressed twice.
              event.preventDefault();
              remove.mutate(
                { userId: person.userId },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
