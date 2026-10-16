"use client";

// Deleting a role: only one nobody has (the api refuses others), asked once more. Its name becomes free again. It is a
// change, so it waits while the subscription refuses changes; the role editor says why (ADR 0021). The shared
// ConfirmDialog stays until the api answers and shows a refusal's reason; the toast and the move to the roles list are
// the hook's (use-roles.ts).
import type { RoleSummary } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useWriteAccess } from "@/subscription/write-access";
import { useDeleteRole } from "./use-roles";

export function DeleteRoleDialog({
  role,
  describedBy,
}: {
  role: RoleSummary;
  /** The ids of what says why it is disabled (its members, the subscription), which the editor shows. */
  describedBy?: string | undefined;
}) {
  const t = useTranslations("roles.delete");
  const remove = useDeleteRole(role.name);
  const [open, setOpen] = useState(false);
  const write = useWriteAccess();
  return (
    <>
      <Button
        variant="destructive"
        disabled={role.memberCount > 0 || !write.allowed}
        aria-describedby={describedBy}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title", { name: role.name })}
        description={t("description")}
        action={t("confirm")}
        request={remove}
        onConfirm={() => {
          remove.mutate(
            { key: role.key },
            {
              onSuccess: () => {
                setOpen(false);
              },
            },
          );
        }}
      />
    </>
  );
}
