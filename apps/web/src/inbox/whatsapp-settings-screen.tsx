"use client";

// /settings/whatsapp (spec 3.4): the agency's number and how it is doing, in words; never MSG91's name or a secret. Templates
// (for whoever may manage them) are the section below. Not connected says so in the same sentence as the inbox.
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Details } from "@/components/details";
import { formatPhoneNumber } from "@/lib/format";
import { routes } from "@/lib/routes";
import Link from "next/link";
import { useHolds } from "@/session/me-context";
import { NotSetUp } from "./not-set-up";
import { TemplatesSection } from "./templates-section";
import { useInboxStatus } from "./use-inbox";

const tones: Record<string, StatusTone> = {
  connected: "good",
  setup: "neutral",
  paused: "attention",
  problem: "bad",
  disconnected: "neutral",
};

export function WhatsappSettingsScreen() {
  const t = useTranslations("inbox.settings");
  const status = useInboxStatus();
  const mayManageTemplates = useHolds("inbox:templates");
  const body = () => {
    if (status.data === undefined) {
      return status.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={status.error}
          retryLabel={t("retry")}
          onRetry={() => void status.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" />
      );
    }
    const { configured, connected, connectionStatus, number, demo } = status.data;
    if (!configured || connectionStatus === null || connectionStatus === "disconnected") {
      return <NotSetUp scope="inbox.settings" />;
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="max-w-[720px]">
          <Details
            rows={[
              {
                label: t("status"),
                value: <StatusBadge tone={tones[connectionStatus] ?? "neutral"}>{t(connectionStatus)}</StatusBadge>,
              },
              ...(number === null
                ? []
                : [{ label: t("number"), value: <span className="numbers">{formatPhoneNumber(number)}</span> }]),
            ]}
          />
        </div>
        {demo && <p className="text-muted-foreground">{t("demoNote")}</p>}
        {connected && mayManageTemplates && !demo && <TemplatesSection />}
        {connected && (
          <Button asChild variant="outline" className="self-start">
            <Link href={routes.inbox}>{t("openInbox")}</Link>
          </Button>
        )}
      </div>
    );
  };
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
