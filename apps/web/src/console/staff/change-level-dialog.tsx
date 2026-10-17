"use client";

// Changing someone's level: support works with organizations, a super admin also manages plans, platform staff and
// permanent deletion. The api refuses to demote the last super admin, and the dialog says so. The change closes the
// dialog in the mutation's own onSuccess; while it is out nothing closes the dialog.
import type { PlatformStaffEntry, PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormAlert, FormDialog } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { LevelField } from "./level-field";
import { useSetPlatformStaffLevel } from "./use-platform-staff";

export function ChangeLevelDialog({
  person,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  person: PlatformStaffEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consolePlatform.staff.changeLevel");
  const [level, setLevel] = useState<PlatformStaffLevel>(person.level ?? "support");
  const change = useSetPlatformStaffLevel(person.name, () => {
    onOpenChange(false);
  });
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={{ open, setOpen: onOpenChange }}
      sending={change}
      title={t("title", { name: person.name })}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
      canSubmit={level !== person.level}
    >
      {(formId) => (
        <form
          id={formId}
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate({ userId: person.userId, level });
          }}
        >
          <LevelField value={level} onChange={setLevel} />
          <FormAlert sending={change} problem={undefined} />
        </form>
      )}
    </FormDialog>
  );
}
