"use client";

// Whether a platform staff member can use the console yet (ADR 0019: a temporary password replaced, two-factor on),
// as one status, a dot and a word, for the step still to take; the second step, when both are, as plain text.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";

export function SignInState({
  person,
}: {
  person: Pick<PlatformStaffEntry, "mustChangePassword" | "twoFactorEnabled">;
}) {
  const t = useTranslations("consolePlatform.staff");
  if (person.mustChangePassword) {
    return (
      <span className="flex flex-col items-start gap-1">
        <StatusBadge tone="attention">{t("mustReplacePassword")}</StatusBadge>
        {!person.twoFactorEnabled && <span className="text-caption text-muted-foreground">{t("twoFactorOff")}</span>}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start">
      <StatusBadge tone={person.twoFactorEnabled ? "good" : "attention"}>
        {person.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}
      </StatusBadge>
    </span>
  );
}
