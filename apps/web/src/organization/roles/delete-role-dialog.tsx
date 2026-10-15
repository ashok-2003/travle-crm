"use client";

// Deleting a role: only one nobody has (the api refuses others), asked once more. Its name becomes free again.
import type { RoleSummary } from "@travel-crm/contracts/identity";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { useDeleteRole } from "./use-roles";

export function DeleteRoleDialog({ role }: { role: RoleSummary }) {
  const t = useTranslations("roles.delete");
  const tCommon = useTranslations("common");
  const { apiError } = useErrorMessage();
  const router = useRouter();
  const remove = useDeleteRole();
  const [open, setOpen] = useState(false);
  const inUse = role.memberCount > 0;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="destructive"
        disabled={inUse}
        aria-describedby={inUse ? "role-in-use" : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      {inUse && <FieldDescription id="role-in-use">{t("inUse", { count: role.memberCount })}</FieldDescription>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title", { name: role.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
              className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate(
                  { key: role.key },
                  {
                    onSuccess: () => {
                      toast.success(t("deleted", { name: role.name }));
                      router.push(routes.roles);
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
    </div>
  );
}
