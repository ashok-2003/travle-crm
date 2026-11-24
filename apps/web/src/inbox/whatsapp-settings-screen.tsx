"use client";

// /settings/whatsapp (spec 3.4): the agency's number and how it is doing, in words; never MSG91's name or a secret. With
// two numbers or more (spec 2026-11-22 section 11), a table of them: label (the main one marked), number and status.
// Templates (per number), quick replies, the chats' tags, trip details (for whoever may manage them) are the sections
// below (sales inbox spec 5). Not connected says so in the same sentence as the inbox.
import type { WhatsappNumber } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Details } from "@/components/details";
import { formatPhoneNumber } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";
import { routes } from "@/lib/routes";
import Link from "next/link";
import { useHolds } from "@/session/me-context";
import { NotSetUp } from "./not-set-up";
import { AutomationSection } from "./automation-section";
import { QuickRepliesSection, TagsSection } from "./quick-replies-section";
import { TemplatesSection } from "./templates-section";
import { TripKitsSection } from "./trip-kits/trip-kits-section";
import { useInboxStatus } from "./use-inbox";
import { useNumbers } from "./use-numbers";

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
  const numbers = useNumbers();
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
    const { configured, connected, demo } = status.data;
    const [only] = numbers.live;
    // An older api lists no numbers (the release window): whether it is connected says if WhatsApp is set up.
    const listed = mayBeMissing(status.data.numbers) !== undefined;
    if (!configured || (listed ? only === undefined : !connected)) return <NotSetUp scope="inbox.settings" />;
    const badge = (state: WhatsappNumber["status"]) => (
      <StatusBadge tone={tones[state] ?? "neutral"}>{t(state)}</StatusBadge>
    );
    return (
      <div className="flex flex-col gap-4">
        {only === undefined ? null : numbers.show ? (
          <Table aria-label={t("numbers")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("label")}</TableHead>
                <TableHead>{t("number")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.live.map((number) => (
                <TableRow key={number.id}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      {number.label}
                      {number.main && <Badge variant="outline">{t("main")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="numbers">{formatPhoneNumber(number.displayNumber)}</TableCell>
                  <TableCell>{badge(number.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="max-w-[720px]">
            <Details
              rows={[
                { label: t("status"), value: badge(only.status) },
                {
                  label: t("number"),
                  value: <span className="numbers">{formatPhoneNumber(only.displayNumber)}</span>,
                },
              ]}
            />
          </div>
        )}
        {demo && <p className="text-muted-foreground">{t("demoNote")}</p>}
        {connected && mayManageTemplates && !demo && <TemplatesSection />}
        {connected && mayManageTemplates && (
          <>
            <QuickRepliesSection />
            <TagsSection />
            <TripKitsSection />
            <AutomationSection />
          </>
        )}
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
