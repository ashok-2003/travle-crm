"use client";

// The settings screen: the organization's name and sign-in code, read-only here (the platform team sets them), and
// whether everyone must use two-factor sign-in.
import { useTranslations } from "next-intl";
import { Detail } from "@/components/detail";
import { PageTitle } from "@/components/page-title";
import { Card, CardContent } from "@/components/ui/card";
import { ItemGroup } from "@/components/ui/item";
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
        <ItemGroup>
          <Detail label={t("organization.name")}>{me.organization.name}</Detail>
          <Detail
            label={t("organization.code")}
            action={<CopyButton value={me.organization.code} label={t("organization.copyCode")} />}
          >
            <span className="numbers">{me.organization.code}</span>
          </Detail>
        </ItemGroup>
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
    </div>
  );
}
