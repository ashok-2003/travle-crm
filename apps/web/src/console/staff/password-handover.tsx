"use client";

// What a super admin gives a newcomer, or someone given a new temporary password, to sign in: their address and the
// temporary password, each with a copy button, and what they must do at first sign-in. Shown once: nothing keeps the
// password but its hash.
import { useTranslations } from "next-intl";
import { CopyButton } from "@/organization/copy-button";

export function PasswordHandover({
  email,
  password,
  intro,
}: {
  email: string | null;
  password: string;
  /** "Give Neha these details to sign in:", or the like. */
  intro: string;
}) {
  const t = useTranslations("consolePlatform.staff.handover");
  const rows = [
    ...(email === null ? [] : [{ label: t("email"), value: email, copy: t("copyEmail") }]),
    { label: t("temporaryPassword"), value: password, copy: t("copyPassword") },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>{intro}</p>
      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-40 text-label text-muted-foreground">{row.label}</dt>
            <dd className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span className="numbers break-all">{row.value}</span>
              <CopyButton value={row.value} label={row.copy} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-label">{t("firstSignIn")}</p>
    </div>
  );
}
