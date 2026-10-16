"use client";

// A document's links, newest first: each one's label, whether it still opens the document, how often customers opened
// it and when last (in the organization's zone), when it expires, and the way to turn a working one off.
import type { ShareLinkSummary } from "@travel-crm/contracts/share-links";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { formatDay, formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { linkTones, shareLinkState } from "./share-link-state";
import { useRevokeShareLink, useShareLinks } from "./use-share-links";

function ShareLinkRow({ link }: { link: ShareLinkSummary }) {
  const t = useTranslations("documents.share");
  const { timeZone } = useMe().organization;
  // Turning a link off takes a customer's access away, which read-only allows.
  const revokeAccess = useWriteAccess("revoke");
  const [revoking, setRevoking] = useState(false);
  const revoke = useRevokeShareLink(() => {
    setRevoking(false);
  });
  const state = shareLinkState(link);
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <span className="wrap-anywhere script-leading">{link.label}</span>
          <StatusBadge tone={linkTones[state]}>{t(`status.${state}`)}</StatusBadge>
        </ItemTitle>
        <ItemDescription className="flex flex-wrap gap-x-3 gap-y-1">
          <span>
            {link.lastOpenedAt === null
              ? t("notOpened")
              : t("opened", { count: link.openCount, when: formatDayTime(new Date(link.lastOpenedAt), { timeZone }) })}
          </span>
          <span>
            {link.expiresAt === null
              ? t("neverExpires")
              : t("expires", { day: formatDay(new Date(link.expiresAt), { timeZone }) })}
          </span>
        </ItemDescription>
      </ItemContent>
      {state === "active" && (
        <ItemActions>
          <Button
            variant="outline"
            aria-label={t("revokeNamed", { label: link.label })}
            disabled={!revokeAccess.allowed}
            onClick={() => {
              setRevoking(true);
            }}
          >
            {t("revoke")}
          </Button>
          {/* Whoever has the link can no longer open the document, and it can't be undone. */}
          <ConfirmDialog
            open={revoking}
            onOpenChange={setRevoking}
            title={t("revokeTitle")}
            description={t("revokeDescription")}
            action={t("revokeConfirm")}
            request={revoke}
            onConfirm={() => {
              revoke.mutate({ shareLinkId: link.id });
            }}
          />
        </ItemActions>
      )}
    </Item>
  );
}

export function ShareLinkList({ documentId }: { documentId: string }) {
  const t = useTranslations("documents.share");
  const tCommon = useTranslations("common");
  const links = useShareLinks(documentId);
  if (links.data) {
    if (links.data.length === 0) return <p className="text-muted-foreground">{t("none")}</p>;
    return (
      <ItemGroup>
        {links.data.map((link, index) => (
          <Fragment key={link.id}>
            {index > 0 && <ItemSeparator />}
            <ShareLinkRow link={link} />
          </Fragment>
        ))}
      </ItemGroup>
    );
  }
  if (links.isError) {
    return (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void links.refetch()} />
    );
  }
  return <LoadingRows rows={1} shape="twoLines" />;
}
