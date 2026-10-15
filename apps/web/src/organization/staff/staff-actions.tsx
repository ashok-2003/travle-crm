"use client";

// The actions on one person: change their role, reset their password, remove them. Nobody acts on themselves here
// (the api refuses it), so their own row has none.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangeRoleDialog } from "./change-role-dialog";
import { RemoveStaffDialog } from "./remove-staff-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

type OpenDialog = "role" | "password" | "remove" | null;

export function StaffActions({ member, roles }: { member: StaffMember; roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const [open, setOpen] = useState<OpenDialog>(null);
  const closeWhen = (dialog: Exclude<OpenDialog, null>) => (next: boolean) => {
    setOpen(next ? dialog : null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actionsFor", { name: member.name })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setOpen("role");
            }}
          >
            {t("changeRole.action")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setOpen("password");
            }}
          >
            {t("resetPassword.action")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              setOpen("remove");
            }}
          >
            {t("remove.action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "role" && <ChangeRoleDialog member={member} roles={roles} open onOpenChange={closeWhen("role")} />}
      {open === "password" && <ResetPasswordDialog member={member} open onOpenChange={closeWhen("password")} />}
      {open === "remove" && <RemoveStaffDialog member={member} open onOpenChange={closeWhen("remove")} />}
    </>
  );
}
