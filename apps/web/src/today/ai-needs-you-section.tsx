"use client";

// "AI needs you", My tasks' tab for the AI (web revamp part 2): the payments waiting for the member's word as one line,
// then a table of the chats the AI handed over and its Lost / Not a lead suggestions on the member's own leads, each
// with its buttons as before (Open chat; Yes and No). The AI agent page is a link away for whoever manages the AI.
import type { HandedOverChat, StageSuggestion } from "@travel-crm/contracts/ai";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CustomerCell } from "@/components/customer-cell";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ForwardLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { ClampedText, WorkTable } from "@/components/work-table";
import { SuggestionButtons } from "@/ai/stage-suggestion";
import type { useNeedsMe } from "@/ai/use-needs-me";
import { formatDayTime } from "@/lib/format";
import { inboxRoute, leadRoute, routes } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { useHolds, useMe } from "@/session/me-context";
import { PaymentsToCheckLine } from "./payments-to-check-line";

type AiRow = { kind: "chat"; chat: HandedOverChat } | { kind: "suggestion"; suggestion: StageSuggestion };

export function AiNeedsYouSection({
  needs,
  paymentsToCheck,
}: {
  needs: ReturnType<typeof useNeedsMe>;
  paymentsToCheck: number;
}) {
  const t = useTranslations("today");
  const managesAi = useHolds("ai:manage");
  const { timeZone } = useMe().organization;
  const now = useNow();
  const rows: AiRow[] = [
    ...needs.handedOver.map((chat) => ({ kind: "chat" as const, chat })),
    ...needs.suggestions.map((suggestion) => ({ kind: "suggestion" as const, suggestion })),
  ];
  return (
    <div className="flex flex-col gap-3">
      {managesAi && <ForwardLink href={routes.aiAgent} label={t("aiAgentLink")} />}
      {paymentsToCheck > 0 && <PaymentsToCheckLine count={paymentsToCheck} />}
      {needs.isError && (
        <LoadFailedAlert message={t("aiNeedsYou.loadFailed")} error={needs.error} onRetry={needs.refetch} />
      )}
      {rows.length > 0 && (
        <WorkTable
          label={t("sections.aiNeedsYou")}
          rows={rows}
          rowKey={(row) => (row.kind === "chat" ? row.chat.conversationId : row.suggestion.id)}
          columns={[
            {
              header: t("columns.customer"),
              width: 200,
              cell: (row) =>
                row.kind === "chat" ? (
                  <CustomerCell name={row.chat.name} />
                ) : (
                  <CustomerCell name={row.suggestion.name} href={leadRoute(row.suggestion.leadId)} />
                ),
            },
            {
              header: t("columns.since"),
              width: 176,
              cell: (row) => (
                <span className="text-label text-muted-foreground">
                  {formatDayTime(new Date(row.kind === "chat" ? row.chat.since : row.suggestion.createdAt), {
                    timeZone,
                    now,
                  })}
                </span>
              ),
            },
            {
              header: t("columns.why"),
              min: 240,
              cell: (row) => (
                <ClampedText
                  text={
                    row.kind === "suggestion"
                      ? t("aiNeedsYou.suggestion", { reason: row.suggestion.reason })
                      : row.chat.reason === null
                        ? t("aiNeedsYou.handedOver")
                        : t("aiNeedsYou.handedOverWhy", { reason: row.chat.reason })
                  }
                />
              ),
            },
          ]}
          actions={{
            header: t("columns.actions"),
            // Open chat, or Yes and No (No wraps under a long Yes): narrow enough to sit beside Customer at 768px.
            width: 240,
            cell: (row) =>
              row.kind === "chat" ? (
                <Button variant="outline" asChild>
                  <Link
                    href={inboxRoute(row.chat.conversationId)}
                    aria-label={t("aiNeedsYou.openChatPerson", { name: row.chat.name })}
                  >
                    {t("aiNeedsYou.openChat")}
                  </Link>
                </Button>
              ) : (
                <SuggestionButtons suggestion={row.suggestion} />
              ),
          }}
          more={t("aiNeedsYou.showMore")}
        />
      )}
    </div>
  );
}
