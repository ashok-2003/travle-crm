"use client";

// Removing someone (ADR 0007): asked once more, because they are signed out at once and can't come back. The shared
// ConfirmDialog stays until the api answers and shows a refusal's reason; the success toast is the hook's
// (use-staff.ts).
import type { StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useRemoveStaff } from "./use-staff";

export function RemoveStaffDialog({
  member,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  member: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("staff.remove");
  const remove = useRemoveStaff(member.name, () => {
    onOpenChange(false);
  });
  return (
    <ConfirmDialog
      returnFocusTo={returnFocusTo}
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name: member.name })}
      description={t("description")}
      action={t("confirm")}
      request={remove}
      onConfirm={() => {
        remove.mutate({ memberId: member.memberId });
      }}
    />
  );
}
