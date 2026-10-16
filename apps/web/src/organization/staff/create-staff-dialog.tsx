"use client";

// "Add staff": the form, then the details to hand over once the person exists. A new member is a change, so while the
// subscription refuses changes the button is disabled and says why (ADR 0021).
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
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
  const write = useWriteAccess();
  const formId = useId();

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
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={!write.allowed}
        aria-describedby={write.hint === null ? undefined : "add-staff-refused"}
        onClick={() => {
          changeOpen(true);
        }}
      >
        <UserPlusIcon aria-hidden="true" />
        {t("add")}
      </Button>
      {write.hint !== null && (
        <FieldDescription id="add-staff-refused" className="max-w-[40ch]">
          {write.hint}
        </FieldDescription>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={changeOpen}
        busy={create.isPending}
        title={created ? t("create.added", { name: created.member.name }) : t("create.title")}
        description={created ? t("create.temporaryPasswordHint") : t("create.description")}
        // Once added, Done ends the dialog: there is nothing left to cancel.
        cancel={created === null}
        footer={
          created ? (
            <Button
              onClick={() => {
                changeOpen(false);
              }}
            >
              {t("create.done")}
            </Button>
          ) : (
            <Button type="submit" form={formId} disabled={create.isPending}>
              {create.isPending ? t("create.submitting") : t("create.submit")}
            </Button>
          )
        }
      >
        {created ? (
          <Handover
            name={created.member.name}
            organizationCode={created.member.username === null ? null : me.organization.code}
            signInName={handoverSignInName(created.member)}
            password={created.password}
          />
        ) : (
          <CreateStaffForm
            id={formId}
            roles={roles}
            create={create}
            onCreated={(member, password) => {
              setCreated({ member, password });
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
