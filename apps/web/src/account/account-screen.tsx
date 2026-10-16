"use client";

// /account: who the person is (from me.get, so a placeholder email is never shown), their password and two-factor
// sign-in, and the way to choose what notifications reach them.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Details } from "@/components/details";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { shownEmail } from "@/lib/shown-email";
import { useMe } from "@/session/me-context";
import { TurnOffTwoFactor } from "./turn-off-two-factor";

/** A name as people typed it, in any script: Indian scripts need a taller line, and the name carries no lang. */
function Name({ children }: { children: ReactNode }) {
  return <span className="script-leading">{children}</span>;
}

export function AccountScreen() {
  const t = useTranslations("account.account");
  const tNotifications = useTranslations("notifications.account");
  const me = useMe();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user, organization, member } = me;
  const email = shownEmail(user.email);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <Details
        rows={[
          { label: t("name"), value: <Name>{user.name}</Name> },
          ...(email === null ? [] : [{ label: t("email"), value: email }]),
          ...(user.username === null ? [] : [{ label: t("username"), value: user.username }]),
          {
            label: t("organization"),
            value: (
              <>
                <Name>{organization.name}</Name>
                <span className="numbers text-muted-foreground">{organization.code}</span>
              </>
            ),
          },
          { label: t("role"), value: <Name>{member.role.name}</Name> },
          {
            label: t("password"),
            action: (
              <Button variant="outline" asChild>
                <Link href={routes.changePassword}>{t("changePassword")}</Link>
              </Button>
            ),
          },
          user.twoFactorEnabled
            ? {
                label: t("twoFactor"),
                value: <StatusBadge tone="good">{t("twoFactorOn")}</StatusBadge>,
                action: organization.requireTwoFactor ? (
                  <span className="text-label text-muted-foreground">{t("twoFactorRequired")}</span>
                ) : (
                  <TurnOffTwoFactor
                    onTurnedOff={() => queryClient.invalidateQueries({ queryKey: trpc.me.get.queryKey() })}
                  />
                ),
              }
            : {
                label: t("twoFactor"),
                value: <StatusBadge tone="neutral">{t("twoFactorOff")}</StatusBadge>,
                action: (
                  <Button variant="outline" asChild>
                    <Link href={routes.twoFactorSetup}>{t("setUp")}</Link>
                  </Button>
                ),
              },
          {
            label: tNotifications("label"),
            action: (
              <Button variant="outline" asChild>
                <Link href={routes.notificationPreferences}>{tNotifications("action")}</Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
