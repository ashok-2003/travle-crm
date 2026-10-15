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
import { handoverSignInName } from "./staff-details";
import { useCreateStaff } from "./use-staff";

export function CreateStaffDialog({ roles }: { roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ member: StaffMember; password: string } | null>(null);
  const create = useCreateStaff();

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // The temporary password is in the form's values and the call's variables: let go of both, so it exists only
      // while this dialog shows it.
      setCreated(null);
      create.reset();
    }
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
              signInName={handoverSignInName(created.member)}
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
            create={create}
            onCreated={(member, password) => {
              setCreated({ member, password });
            }}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
