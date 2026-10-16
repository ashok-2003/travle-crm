"use client";

// "Add platform staff": the form, then the details to hand over once the person exists: their address and the
// temporary password the api made, shown this once.
import type { AddedPlatformStaff, AddPlatformStaffInput } from "@travel-crm/contracts/platform";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/organization/responsive-dialog";
import { AddStaffForm } from "./add-staff-form";
import { PasswordHandover } from "./password-handover";
import { useAddPlatformStaff } from "./use-platform-staff";

export function AddStaffDialog() {
  const t = useTranslations("consolePlatform.staff");
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<{ input: AddPlatformStaffInput; answer: AddedPlatformStaff } | null>(null);
  const add = useAddPlatformStaff((input, answer) => {
    setAdded({ input, answer });
  });

  const changeOpen = (next: boolean) => {
    // Closing would hide a request the api is already carrying out, and the password it answers with.
    if (add.isPending) return;
    setOpen(next);
    if (!next) {
      // The temporary password is in the call's answer and in this state: let go of both, so it exists only while
      // this dialog shows it.
      setAdded(null);
      add.reset();
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
        title={added ? t("handover.added", { name: added.input.name }) : t("addForm.title")}
        description={added ? t("handover.shownOnce") : t("addForm.description")}
      >
        {added ? (
          <div className="flex flex-col gap-6">
            <PasswordHandover
              email={added.input.email}
              password={added.answer.temporaryPassword}
              intro={t("handover.intro", { name: added.input.name })}
            />
            <Button
              className="self-end"
              onClick={() => {
                changeOpen(false);
              }}
            >
              {t("handover.done")}
            </Button>
          </div>
        ) : (
          open && <AddStaffForm add={add} />
        )}
      </ResponsiveDialog>
    </>
  );
}
