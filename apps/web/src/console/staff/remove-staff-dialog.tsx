"use client";

// Removing someone from the platform staff (ADR 0019), asked once more: they are signed out at once, the
// impersonations they started end, and their address stays taken. The api keeps the last super admin.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useRemovePlatformStaff } from "./use-platform-staff";

export function RemoveStaffDialog({
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
  const t = useTranslations("consolePlatform.staff.remove");
  const remove = useRemovePlatformStaff(person.name, () => {
    onOpenChange(false);
  });
  return (
    <ConfirmDialog
      returnFocusTo={returnFocusTo}
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name: person.name })}
      description={t("description")}
      action={t("confirm")}
      request={remove}
      onConfirm={() => {
        remove.mutate({ userId: person.userId });
      }}
    />
  );
}
