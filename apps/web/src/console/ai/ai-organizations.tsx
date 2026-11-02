"use client";

// Every agency's AI now (the owner, 2026-11-02): working, or why not and since when, its calls this month against its
// limit, its tokens and cost, and its last call; those needing a look first. The registry Table, scrolling sideways on a
// phone.
import type { AiOrganizationUsage } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useInstantText } from "@/components/instant-text";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount } from "@/lib/format";
import { rupeesOf } from "../growth/usage-screen";
import { consoleRoutes } from "../routes";

const tones: Record<AiOrganizationUsage["state"], StatusTone> = {
  working: "good",
  unused: "neutral",
  off: "neutral",
  not_on_plan: "neutral",
  subscription_blocked: "attention",
  limit_reached: "bad",
  failing: "bad",
};

export function AiOrganizations({ organizations }: { organizations: AiOrganizationUsage[] }) {
  const t = useTranslations("consoleAi.organizations");
  const instantText = useInstantText();
  const why = (row: AiOrganizationUsage) => {
    if (row.state === "working") {
      return row.since === null ? t("why.workingNoTime") : t("why.working", { since: instantText(row.since) });
    }
    if (row.state === "failing") {
      return row.failingReason === "rate_limited" ? t("why.failingRateLimited") : t("why.failingUnavailable");
    }
    return t(`why.${row.state}`);
  };
  return (
    <section aria-labelledby="ai-organizations-heading" className="flex flex-col gap-3">
      <h2 id="ai-organizations-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      {organizations.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.agency")}</TableHead>
                  <TableHead>{t("columns.state")}</TableHead>
                  <TableHead>{t("columns.why")}</TableHead>
                  <TableHead>{t("columns.calls")}</TableHead>
                  <TableHead className="text-right">{t("columns.tokens")}</TableHead>
                  <TableHead className="text-right">{t("columns.cost")}</TableHead>
                  <TableHead>{t("columns.last")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((row) => (
                  <TableRow key={row.organizationId}>
                    <TableCell>
                      <div className="flex flex-col items-start gap-0.5">
                        <TextLink inline href={consoleRoutes.organization(row.organizationId)}>
                          {row.name}
                        </TextLink>
                        <span className="numbers text-caption text-muted-foreground">{row.code}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={tones[row.state]}>{t(`states.${row.state}`)}</StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-[32ch] whitespace-normal">
                      <span>{why(row)}</span>
                      {row.since !== null && row.state !== "working" && (
                        <span className="block text-caption text-muted-foreground">
                          {t("why.since", { when: instantText(row.since) })}
                        </span>
                      )}
                      {row.failedToday > 0 && (
                        <span className="block text-caption text-status-bad-ink">
                          {t("failedToday", { count: row.failedToday })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-36">
                      <span className="numbers">
                        {t("of", { used: formatCount(row.callsThisMonth), limit: formatCount(row.limit) })}
                      </span>
                      <Progress
                        value={Math.min(100, (row.callsThisMonth / Math.max(1, row.limit)) * 100)}
                        aria-label={t("columns.calls")}
                      />
                    </TableCell>
                    <TableCell className="numbers text-right">
                      {formatCount(row.thisMonth.inputTokens + row.thisMonth.outputTokens)}
                    </TableCell>
                    <TableCell className="numbers text-right">{rupeesOf(row.thisMonth.costPaise)}</TableCell>
                    <TableCell className="text-caption">
                      {row.lastCallAt === null ? t("never") : instantText(row.lastCallAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
