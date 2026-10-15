"use client";

// Removing someone (ADR 0007): asked once more, because they are signed out at once and can't come back.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { useRemoveStaff } from "./use-staff";

export function RemoveStaffDialog({
  member,
  open,
  onOpenChange,
}: {
  member: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff.remove");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const remove = useRemoveStaff();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name: member.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
            className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
            disabled={remove.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so the answer is shown here and the button can't be pressed twice.
              event.preventDefault();
              remove.mutate(
                { memberId: member.memberId },
                {
                  onSuccess: () => {
                    toast.success(t("removed", { name: member.name }));
                    onOpenChange(false);
                  },
                  onError: (error) => toast.error(apiError(error), { duration: Infinity }),
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
