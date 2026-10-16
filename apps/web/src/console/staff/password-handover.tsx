"use client";

// What a super admin gives a newcomer, or someone given a new temporary password, to sign in: their address and the
// temporary password, each with a copy button, and what they must do at first sign-in. Shown once: nothing keeps the
// password but its hash.
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { CopyButton } from "@/organization/copy-button";

export function PasswordHandover({
  email,
  password,
  intro,
}: {
  email: string;
  password: string;
  /** "Give Neha these details to sign in:", or the like. */
  intro: string;
}) {
  const t = useTranslations("consolePlatform.staff.handover");
  const rows = [
    { label: t("email"), value: email, copy: t("copyEmail") },
    { label: t("temporaryPassword"), value: password, copy: t("copyPassword") },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>{intro}</p>
      <Details
        rows={rows.map(({ label, value, copy }) => ({
          label,
          value: <span className="numbers">{value}</span>,
          action: <CopyButton value={value} label={copy} />,
        }))}
      />
      <p className="text-label">{t("firstSignIn")}</p>
    </div>
  );
}
