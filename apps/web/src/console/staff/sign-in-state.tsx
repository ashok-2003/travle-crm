"use client";

// Whether a platform staff member can use the console yet (ADR 0019: a temporary password replaced, two-factor on),
// as one status, a dot and a word, for the step still to take; the second step, when both are, as plain text. With
// two-factor off (features.twoFactor) the only step is the password, and nothing shows once it is replaced.
import { features } from "@travel-crm/contracts/features";
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
        {features.twoFactor && !person.twoFactorEnabled && (
          <span className="text-caption text-muted-foreground">{t("twoFactorOff")}</span>
        )}
      </span>
    );
  }
  if (!features.twoFactor) return null;
  return (
    <span className="flex flex-col items-start">
      <StatusBadge tone={person.twoFactorEnabled ? "good" : "attention"}>
        {person.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}
      </StatusBadge>
    </span>
  );
}
