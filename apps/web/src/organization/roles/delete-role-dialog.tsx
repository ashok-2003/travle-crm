"use client";

// Deleting a role: only one nobody has (the api refuses others), asked once more. Its name becomes free again. It is a
// change, so it waits while the subscription refuses changes; the role editor says why (ADR 0021). Once asked, the
// dialog stays until the api answers; the toast and the move to the roles list are the hook's (use-roles.ts).
import type { RoleSummary } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { useWriteAccess } from "@/subscription/write-access";
import { useDeleteRole } from "./use-roles";

export function DeleteRoleDialog({
  role,
  describedBy,
}: {
  role: RoleSummary;
  /** The id of what says why changes are refused, when they are. */
  describedBy?: string | undefined;
}) {
  const t = useTranslations("roles.delete");
  const tCommon = useTranslations("common");
  const remove = useDeleteRole(role.name);
  const [open, setOpen] = useState(false);
  const inUse = role.memberCount > 0;
  const write = useWriteAccess();
  // Why it is disabled: the role's members, the subscription, or both.
  const reasons = [inUse ? "role-in-use" : undefined, describedBy].filter((id) => id !== undefined);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="destructive"
        disabled={inUse || !write.allowed}
        aria-describedby={reasons.length > 0 ? reasons.join(" ") : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      {inUse && <FieldDescription id="role-in-use">{t("inUse", { count: role.memberCount })}</FieldDescription>}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!remove.isPending) setOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title", { name: role.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate({ key: role.key });
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
