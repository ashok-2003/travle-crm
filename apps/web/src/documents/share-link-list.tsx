"use client";

// A document's links, newest first: each one's label, whether it still opens the document, how often customers opened
// it and when last (in the organization's zone), when it expires, and the way to turn a working one off.
import type { ShareLinkSummary } from "@travel-crm/contracts/share-links";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, formatTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { RevokeShareLinkDialog } from "./revoke-share-link-dialog";
import { linkTones, shareLinkState } from "./share-link-state";
import { useShareLinks } from "./use-share-links";

function ShareLinkRow({ link }: { link: ShareLinkSummary }) {
  const t = useTranslations("documents.share");
  const { timeZone } = useMe().organization;
  // Turning a link off takes a customer's access away, which read-only allows.
  const revokeAccess = useWriteAccess("revoke");
  const [revoking, setRevoking] = useState(false);
  const state = shareLinkState(link);
  const when = (instant: string) => {
    const at = new Date(instant);
    return t("when", { day: formatDay(at, { timeZone }), time: formatTime(at, { timeZone }) });
  };
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words script-leading">{link.label}</span>
          <StatusBadge tone={linkTones[state]}>{t(`status.${state}`)}</StatusBadge>
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-label text-muted-foreground">
          <span>
            {link.lastOpenedAt === null
              ? t("notOpened")
              : t("opened", { count: link.openCount, when: when(link.lastOpenedAt) })}
          </span>
          <span>
            {link.expiresAt === null
              ? t("neverExpires")
              : t("expires", { day: formatDay(new Date(link.expiresAt), { timeZone }) })}
          </span>
        </p>
      </div>
      {state === "active" && (
        <>
          <Button
            variant="destructive"
            aria-label={t("revokeNamed", { label: link.label })}
            disabled={!revokeAccess.allowed}
            onClick={() => {
              setRevoking(true);
            }}
          >
            {t("revoke")}
          </Button>
          <RevokeShareLinkDialog link={link} open={revoking} onOpenChange={setRevoking} />
        </>
      )}
    </li>
  );
}

export function ShareLinkList({ documentId }: { documentId: string }) {
  const t = useTranslations("documents.share");
  const tCommon = useTranslations("common");
  const links = useShareLinks(documentId);
  if (links.data) {
    if (links.data.length === 0) return <p className="text-muted-foreground">{t("none")}</p>;
    return (
      <ul className="divide-y rounded-lg border">
        {links.data.map((link) => (
          <ShareLinkRow key={link.id} link={link} />
        ))}
      </ul>
    );
  }
  if (links.isError) {
    return (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void links.refetch()} />
    );
  }
  return (
    <Delayed>
      <Skeleton role="status" aria-label={tCommon("loading")} className="h-16 w-full" />
    </Delayed>
  );
}
