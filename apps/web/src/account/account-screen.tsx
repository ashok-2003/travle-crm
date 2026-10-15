"use client";

// /account: who the person is (from me.get, so a placeholder email is never shown), and their password and
// two-factor sign-in.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Detail } from "@/components/detail";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ItemGroup } from "@/components/ui/item";
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
  const me = useMe();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user, organization, member } = me;
  const email = shownEmail(user.email);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <ItemGroup>
        <Detail label={t("name")}>
          <Name>{user.name}</Name>
        </Detail>
        {email !== null && <Detail label={t("email")}>{email}</Detail>}
        {user.username !== null && <Detail label={t("username")}>{user.username}</Detail>}
        <Detail label={t("organization")}>
          <Name>{organization.name}</Name> <span className="numbers text-muted-foreground">{organization.code}</span>
        </Detail>
        <Detail label={t("role")}>
          <Name>{member.role.name}</Name>
        </Detail>
        <Detail
          label={t("password")}
          action={
            <Button variant="outline" asChild>
              <Link href={routes.changePassword}>{t("changePassword")}</Link>
            </Button>
          }
        />
        {user.twoFactorEnabled ? (
          <Detail
            label={t("twoFactor")}
            action={
              organization.requireTwoFactor ? (
                <span className="text-label text-muted-foreground">{t("twoFactorRequired")}</span>
              ) : (
                <TurnOffTwoFactor
                  onTurnedOff={() => queryClient.invalidateQueries({ queryKey: trpc.me.get.queryKey() })}
                />
              )
            }
          >
            <StatusBadge tone="good">{t("twoFactorOn")}</StatusBadge>
          </Detail>
        ) : (
          <Detail
            label={t("twoFactor")}
            action={
              <Button variant="outline" asChild>
                <Link href={routes.twoFactorSetup}>{t("setUp")}</Link>
              </Button>
            }
          >
            <StatusBadge tone="neutral">{t("twoFactorOff")}</StatusBadge>
          </Detail>
        )}
      </ItemGroup>
    </div>
  );
}
