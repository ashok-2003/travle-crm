"use client";

// The actions on one person: change their role or phone, reset their password, remove them. Nobody acts on themselves here
// (the api refuses it), so their own row has none. A new password and removing someone take access away, which the
// subscription allows where it refuses other changes (ADR 0021); what it refuses is disabled, and the menu says why.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWriteAccess } from "@/subscription/write-access";
import { ChangePhoneDialog } from "./change-phone-dialog";
import { ChangeRoleDialog } from "./change-role-dialog";
import { RemoveStaffDialog } from "./remove-staff-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

type OpenDialog = "role" | "phone" | "password" | "remove" | null;

export function StaffActions({ member, roles }: { member: StaffMember; roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const [open, setOpen] = useState<OpenDialog>(null);
  // The dialogs aren't the menu's: closed, they give the focus back to its button.
  const menu = useRef<HTMLButtonElement>(null);
  const change = useWriteAccess("change");
  const revoke = useWriteAccess("revoke");
  const closeWhen = (dialog: Exclude<OpenDialog, null>) => (next: boolean) => {
    setOpen(next ? dialog : null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menu} variant="ghost" size="icon" aria-label={t("actionsFor", { name: member.name })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={change.hint === null ? undefined : "w-72"}>
          {change.hint !== null && (
            <DropdownMenuLabel className="text-caption font-normal">{change.hint}</DropdownMenuLabel>
          )}
          <DropdownMenuItem
            disabled={!change.allowed}
            onSelect={() => {
              setOpen("role");
            }}
          >
            {t("changeRole.action")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!change.allowed}
            onSelect={() => {
              setOpen("phone");
            }}
          >
            {t("changePhone.action")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!revoke.allowed}
            onSelect={() => {
              setOpen("password");
            }}
          >
            {t("resetPassword.action")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!revoke.allowed}
            onSelect={() => {
              setOpen("remove");
            }}
          >
            {t("remove.action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "role" && (
        <ChangeRoleDialog member={member} roles={roles} open onOpenChange={closeWhen("role")} returnFocusTo={menu} />
      )}
      {open === "phone" && (
        <ChangePhoneDialog member={member} open onOpenChange={closeWhen("phone")} returnFocusTo={menu} />
      )}
      {open === "password" && (
        <ResetPasswordDialog member={member} open onOpenChange={closeWhen("password")} returnFocusTo={menu} />
      )}
      {open === "remove" && (
        <RemoveStaffDialog member={member} open onOpenChange={closeWhen("remove")} returnFocusTo={menu} />
      )}
    </>
  );
}
