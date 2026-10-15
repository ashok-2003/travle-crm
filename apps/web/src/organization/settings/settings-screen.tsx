"use client";

// The settings screen: the organization's name and sign-in code, read-only here (the platform team sets them), and
// whether everyone must use two-factor sign-in.
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { useMe } from "@/session/me-context";
import { CopyButton } from "../copy-button";
import { TwoFactorRequirement } from "./two-factor-requirement";

export function SettingsScreen() {
  const t = useTranslations("settings");
  const me = useMe();
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <PageTitle>{t("title")}</PageTitle>
      <section aria-labelledby="organization-heading" className="flex flex-col gap-3">
        <h2 id="organization-heading" className="text-section font-semibold">
          {t("organization.heading")}
        </h2>
        <dl className="divide-y rounded-lg border">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-44 text-label text-muted-foreground">{t("organization.name")}</dt>
            <dd className="flex-1 break-words">{me.organization.name}</dd>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <dt className="w-44 text-label text-muted-foreground">{t("organization.code")}</dt>
            <dd className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span className="numbers">{me.organization.code}</span>
              <CopyButton value={me.organization.code} label={t("organization.copyCode")} />
            </dd>
          </div>
        </dl>
        <p className="text-label text-muted-foreground">{t("organization.codeHint")}</p>
      </section>
      <section aria-labelledby="security-heading" className="flex flex-col gap-3">
        <h2 id="security-heading" className="text-section font-semibold">
          {t("security.heading")}
        </h2>
        <div className="rounded-lg border p-4">
          <TwoFactorRequirement />
        </div>
      </section>
    </div>
  );
}
