"use client";

// "Add platform staff": the form, then the details to hand over once the person exists: their address and the
// temporary password the api made, shown this once. The request is the dialog's (its success is the mutation's own),
// and while it is out nothing closes the dialog.
import type { AddedPlatformStaff, AddPlatformStaffInput } from "@travel-crm/contracts/platform";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AddStaffForm } from "./add-staff-form";
import { PasswordHandover } from "./password-handover";
import { useAddPlatformStaff } from "./use-platform-staff";

export function AddStaffDialog() {
  const t = useTranslations("consolePlatform.staff");
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<{ input: AddPlatformStaffInput; answer: AddedPlatformStaff } | null>(null);
  const add = useAddPlatformStaff((input, answer) => {
    setAdded({ input, answer });
  });

  const changeOpen = (next: boolean) => {
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
        busy={add.isPending}
        title={added ? t("handover.added", { name: added.input.name }) : t("addForm.title")}
        description={added ? t("handover.shownOnce") : t("addForm.description")}
        cancel={added === null}
        footer={
          added ? (
            <Button
              onClick={() => {
                changeOpen(false);
              }}
            >
              {t("handover.done")}
            </Button>
          ) : (
            <Button type="submit" form={formId} disabled={add.isPending}>
              {add.isPending && <Spinner />}
              {add.isPending ? t("addForm.submitting") : t("addForm.submit")}
            </Button>
          )
        }
      >
        {added ? (
          <PasswordHandover
            email={added.input.email}
            password={added.answer.temporaryPassword}
            intro={t("handover.intro", { name: added.input.name })}
          />
        ) : (
          open && <AddStaffForm id={formId} sending={add} send={add.mutate} />
        )}
      </ResponsiveDialog>
    </>
  );
}
