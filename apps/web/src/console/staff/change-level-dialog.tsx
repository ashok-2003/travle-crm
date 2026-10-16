"use client";

// Changing someone's level: support works with organizations, a super admin also manages plans, platform staff and
// permanent deletion. The api refuses to demote the last super admin, and the dialog says so. The change closes the
// dialog in the mutation's own onSuccess; while it is out nothing closes the dialog.
import type { PlatformStaffEntry, PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LevelField } from "./level-field";
import { useSetPlatformStaffLevel } from "./use-platform-staff";

export function ChangeLevelDialog({
  person,
  open,
  onOpenChange,
}: {
  person: PlatformStaffEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consolePlatform.staff.changeLevel");
  const formId = useId();
  const [level, setLevel] = useState<PlatformStaffLevel>(person.level ?? "support");
  const change = useSetPlatformStaffLevel(person.name, () => {
    onOpenChange(false);
  });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={change.isPending}
      title={t("title", { name: person.name })}
      description={t("description")}
      footer={
        <Button type="submit" form={formId} disabled={change.isPending || level === person.level}>
          {change.isPending && <Spinner />}
          {change.isPending ? t("submitting") : t("submit")}
        </Button>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          change.mutate({ userId: person.userId, level });
        }}
      >
        <LevelField value={level} onChange={setLevel} />
        <RefusalAlert error={change.error} />
      </form>
    </ResponsiveDialog>
  );
}
