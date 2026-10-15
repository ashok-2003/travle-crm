"use client";

// Changing someone's role: pick it and the list shows it at once; the api's answer confirms it or puts it back.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "../responsive-dialog";
import { useChangeStaffRole } from "./use-staff";

export function ChangeRoleDialog({
  member,
  roles,
  open,
  onOpenChange,
}: {
  member: StaffMember;
  roles: RoleSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("staff");
  const [roleKey, setRoleKey] = useState(member.role.key);
  const changeRole = useChangeStaffRole();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("changeRole.title", { name: member.name })}
      description={t("changeRole.description")}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (roleKey !== member.role.key) changeRole.mutate({ memberId: member.memberId, roleKey });
          onOpenChange(false);
        }}
      >
        <Field>
          <FieldLabel htmlFor={`role-${member.memberId}`}>{t("columns.role")}</FieldLabel>
          <Select value={roleKey} onValueChange={setRoleKey}>
            <SelectTrigger id={`role-${member.memberId}`} className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.key} value={role.key}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" className="self-end">
          {t("changeRole.submit")}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}
