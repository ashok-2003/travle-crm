"use client";

// What a member sees in place of a screen the subscription shuts: what happened, as a status, and how to reach
// support. While suspended, the Owner is shown the way to the screens that stay open to them (locks.ts): Staff, where
// taking someone's access away still works, Documents, whose PDFs download and whose share links turn off, and the
// business files, which download.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page-header";
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
        <PageHeader title={t(`${lock}.title`)} intro={t(`${lock}.body`)} />
      </div>
      {lock === "suspended" && me.member.role.isOwner && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-pretty">{t("suspended.ownerCanRevoke")}</p>
          <div className="flex flex-wrap gap-3">
            {(
              [
                [routes.staff, "toStaff"],
                [routes.documents, "toDocuments"],
                [routes.files, "toFiles"],
              ] as const
            ).map(([href, label]) => (
              <Button key={href} asChild variant="outline">
                <Link href={href}>{t(`suspended.${label}`)}</Link>
              </Button>
            ))}
          </div>
        </div>
      )}
      <SupportContacts />
    </div>
  );
}
