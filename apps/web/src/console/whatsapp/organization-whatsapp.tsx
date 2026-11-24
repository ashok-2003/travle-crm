"use client";

// An organization's WhatsApp group on its console page (spec 3.5; several numbers, spec 2026-11-22 section 10): its live
// numbers, the main one first, each with its own details and actions (number-block.tsx); the live numbers against the
// plan ("1 of 2 numbers"); and Connect a number while the plan has room. Super admins change; support only looks. Looked
// at again while a number is being connected, when its first message is awaited.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Separator } from "@/components/ui/separator";
import { useConsoleTRPC } from "../data/console-trpc";
import { DetailSection } from "../organizations/organization/detail-list";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { ConnectDialog } from "./connect-dialog";
import { NumberBlock } from "./number-block";

const CONNECTING_POLL_MS = 20_000;

export function OrganizationWhatsapp({ organizationId }: { organizationId: string }) {
  const t = useTranslations("consoleWhatsapp");
  const trpc = useConsoleTRPC();
  const mayChange = isSuperAdmin(useStaff());
  const group = useQuery({
    ...trpc.whatsapp.get.queryOptions({ organizationId }),
    refetchInterval: (query) =>
      query.state.data?.numbers.some((number) => number.status === "setup") === true ? CONNECTING_POLL_MS : false,
  });

  if (group.data === undefined) {
    return (
      <DetailSection id="whatsapp-heading" heading={t("group.title")}>
        {group.isError ? (
          <ErrorState
            message={t("group.loadFailed")}
            error={group.error}
            retryLabel={t("retry")}
            onRetry={() => void group.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )}
      </DetailSection>
    );
  }
  const { numbers, limit, cannotAddReason, configured } = group.data;

  return (
    <DetailSection
      id="whatsapp-heading"
      heading={t("group.title")}
      action={mayChange && cannotAddReason === null && <ConnectDialog organizationId={organizationId} />}
    >
      {!configured && <p className="text-muted-foreground">{t("group.notConfigured")}</p>}
      <p className="text-muted-foreground">
        {t("group.limit", { used: limit.used, allowed: limit.allowed })}
        {cannotAddReason !== null && <> {t(`group.cannotAdd.${cannotAddReason}`)}</>}
      </p>
      {numbers.length === 0 && <p className="text-muted-foreground">{t("group.none")}</p>}
      {numbers.map((number, index) => (
        <Fragment key={number.id}>
          {index > 0 && <Separator />}
          <NumberBlock number={number} numbers={numbers} mayChange={mayChange} />
        </Fragment>
      ))}
    </DetailSection>
  );
}
