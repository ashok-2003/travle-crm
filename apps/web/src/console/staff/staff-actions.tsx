"use client";

// A super admin's actions on someone else of the platform staff: change their level, give them a new temporary
// password, remove them. The api keeps the last super admin (LAST_SUPER_ADMIN), and each dialog shows its refusal.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
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
import { ChangeLevelDialog } from "./change-level-dialog";
import { RemoveStaffDialog } from "./remove-staff-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

type OpenDialog = "level" | "password" | "remove" | null;

export function StaffActions({ person }: { person: PlatformStaffEntry }) {
  const t = useTranslations("consolePlatform.staff");
  const [open, setOpen] = useState<OpenDialog>(null);
  const closeWhen = (dialog: Exclude<OpenDialog, null>) => (next: boolean) => {
    setOpen(next ? dialog : null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actionsFor", { name: person.name })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setOpen("level");
            }}
          >
            {t("changeLevel.action")}
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
            variant="destructive"
            onSelect={() => {
              setOpen("remove");
            }}
          >
            {t("remove.action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "level" && <ChangeLevelDialog person={person} open onOpenChange={closeWhen("level")} />}
      {open === "password" && <ResetPasswordDialog person={person} open onOpenChange={closeWhen("password")} />}
      {open === "remove" && <RemoveStaffDialog person={person} open onOpenChange={closeWhen("remove")} />}
    </>
  );
}
