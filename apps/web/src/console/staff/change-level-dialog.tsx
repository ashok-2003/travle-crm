"use client";

// Changing someone's level: support works with organizations, a super admin also manages plans, platform staff and
// permanent deletion. The api refuses to demote the last super admin, and the dialog says so.
import type { PlatformStaffEntry, PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/lib/error-message";
import { ResponsiveDialog } from "@/components/responsive-dialog";
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
  const { apiError } = useErrorMessage();
  const [level, setLevel] = useState<PlatformStaffLevel>(person.level ?? "support");
  const change = useSetPlatformStaffLevel(person.name);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!change.isPending) onOpenChange(next);
      }}
      title={t("title", { name: person.name })}
      description={t("description")}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          change.mutate(
            { userId: person.userId, level },
            {
              onSuccess: () => {
                onOpenChange(false);
              },
            },
          );
        }}
      >
        <LevelField value={level} onChange={setLevel} />
        {change.isError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError(change.error)}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={change.isPending || level === person.level} className="self-end">
          {change.isPending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}
