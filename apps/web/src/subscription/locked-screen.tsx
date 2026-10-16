"use client";

// What a member sees in place of a screen the subscription shuts: what happened, as a status, and how to reach
// support. While suspended, the Owner is shown the way to Staff, where taking someone's access away still works, and
// to Documents, whose PDFs still download and whose share links still turn off.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import type { Lock } from "./locks";
import { SupportContacts } from "./support-contacts";

export function LockedScreen({ lock }: { lock: Lock }) {
  const t = useTranslations("subscription.locked");
  const me = useMe();
  return (
    <div className="flex max-w-[65ch] flex-col gap-8">
      <div className="flex flex-col items-start gap-3">
        <StatusBadge tone={lock === "noSubscription" ? "neutral" : "bad"}>{t(`${lock}.status`)}</StatusBadge>
        <PageTitle>{t(`${lock}.title`)}</PageTitle>
        <p className="text-pretty">{t(`${lock}.body`)}</p>
      </div>
      {lock === "suspended" && me.member.role.isOwner && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-pretty">{t("suspended.ownerCanRevoke")}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={routes.staff}>{t("suspended.toStaff")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.documents}>{t("suspended.toDocuments")}</Link>
            </Button>
          </div>
        </div>
      )}
      <SupportContacts />
    </div>
  );
}
