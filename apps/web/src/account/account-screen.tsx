"use client";

// /account: who the person is (from me.get, so a placeholder email is never shown), and their password and
// two-factor sign-in.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { TurnOffTwoFactor } from "./turn-off-two-factor";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-label text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-3 break-words">{children}</dd>
    </div>
  );
}

export function AccountScreen() {
  const t = useTranslations("account.account");
  const me = useMe();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user, organization, member } = me;

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title")}</PageTitle>
      <dl className="divide-y rounded-lg border">
        <Row label={t("name")}>{user.name}</Row>
        {user.email !== null && <Row label={t("email")}>{user.email}</Row>}
        {user.username !== null && <Row label={t("username")}>{user.username}</Row>}
        <Row label={t("organization")}>
          {organization.name} <span className="numbers text-muted-foreground">{organization.code}</span>
        </Row>
        <Row label={t("role")}>{member.role.name}</Row>
        <Row label={t("password")}>
          <Button variant="outline" asChild>
            <Link href={routes.changePassword}>{t("changePassword")}</Link>
          </Button>
        </Row>
        <Row label={t("twoFactor")}>
          {user.twoFactorEnabled ? (
            <>
              <StatusBadge tone="good">{t("twoFactorOn")}</StatusBadge>
              {organization.requireTwoFactor ? (
                <span className="text-label text-muted-foreground">{t("twoFactorRequired")}</span>
              ) : (
                <TurnOffTwoFactor
                  onTurnedOff={() => queryClient.invalidateQueries({ queryKey: trpc.me.get.queryKey() })}
                />
              )}
            </>
          ) : (
            <>
              <StatusBadge tone="neutral">{t("twoFactorOff")}</StatusBadge>
              <Button variant="outline" asChild>
                <Link href={routes.twoFactorSetup}>{t("setUp")}</Link>
              </Button>
            </>
          )}
        </Row>
      </dl>
    </div>
  );
}
