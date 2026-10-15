"use client";

// "Add staff": the form, then the details to hand over once the person exists.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/session/me-context";
import { ResponsiveDialog } from "../responsive-dialog";
import { CreateStaffForm } from "./create-staff-form";
import { Handover } from "./handover";

export function CreateStaffDialog({ roles }: { roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ member: StaffMember; password: string } | null>(null);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setCreated(null);
  };

  return (
    <>
      <Button
        onClick={() => {
          changeOpen(true);
        }}
      >
        <UserPlusIcon aria-hidden="true" />
        {t("add")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={changeOpen}
        title={created ? t("create.added", { name: created.member.name }) : t("create.title")}
        description={created ? t("create.temporaryPasswordHint") : t("create.description")}
      >
        {created ? (
          <div className="flex flex-col gap-6">
            <Handover
              name={created.member.name}
              organizationCode={created.member.username === null ? null : me.organization.code}
              signInName={created.member.username ?? created.member.email}
              password={created.password}
            />
            <Button
              className="self-end"
              onClick={() => {
                changeOpen(false);
              }}
            >
              {t("create.done")}
            </Button>
          </div>
        ) : (
          <CreateStaffForm
            roles={roles}
            onCreated={(member, password) => {
              setCreated({ member, password });
            }}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
