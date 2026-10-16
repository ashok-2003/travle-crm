"use client";

// The settings screen: the organization's name and sign-in code, read-only here (the platform team sets them),
// whether everyone must use two-factor sign-in, and the way to the organization's other settings.
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useMe } from "@/session/me-context";
import { CopyButton } from "../copy-button";
import { SettingsSections } from "./settings-sections";
import { TwoFactorRequirement } from "./two-factor-requirement";

export function SettingsScreen() {
  const t = useTranslations("settings");
  const me = useMe();
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <PageHeader title={t("title")} />
      <section aria-labelledby="organization-heading" className="flex flex-col gap-3">
        <h2 id="organization-heading" className="text-section font-semibold">
          {t("organization.heading")}
        </h2>
        <Details
          rows={[
            { label: t("organization.name"), value: me.organization.name },
            {
              label: t("organization.code"),
              value: <span className="numbers">{me.organization.code}</span>,
              action: <CopyButton value={me.organization.code} label={t("organization.copyCode")} />,
            },
          ]}
        />
        <p className="text-label text-muted-foreground">{t("organization.codeHint")}</p>
      </section>
      <section aria-labelledby="security-heading" className="flex flex-col gap-3">
        <h2 id="security-heading" className="text-section font-semibold">
          {t("security.heading")}
        </h2>
        <Card>
          <CardContent>
            <TwoFactorRequirement />
          </CardContent>
        </Card>
      </section>
      <SettingsSections />
    </div>
  );
}
