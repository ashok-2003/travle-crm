"use client";

// The dashboard's system health (the owner, 2026-11-02): what is broken now (the AI, jobs, the api, the worker), each
// with what it means, since when and how often it was reported, or a line that all is working; and the last week's
// incidents, resolved. Read again every minute. The super admins are emailed too; this is where they look.
import type { IncidentKind, PlatformIncident } from "@travel-crm/contracts/platform";
import { useQuery } from "@tanstack/react-query";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useInstantText } from "@/components/instant-text";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { useConsoleTRPC } from "../data/console-trpc";
import { consoleRoutes } from "../routes";
import { DASHBOARD_STALE_MS } from "./use-organizations-overview";

const READ_EVERY_MS = 60_000;

/** Each kind's words in the messages ("ai.unavailable" would read as nested keys). */
const kindKeys = {
  "ai.unavailable": "aiUnavailable",
  "ai.rate-limited": "aiRateLimited",
  "jobs.failed": "jobsFailed",
  "api.errors": "apiErrors",
  "worker.stalled": "workerStalled",
} as const satisfies Record<IncidentKind, string>;

export function SystemHealth() {
  const t = useTranslations("console.health");
  const trpc = useConsoleTRPC();
  const instantText = useInstantText();
  const incidents = useQuery(
    trpc.dashboard.incidents.queryOptions(undefined, { refetchInterval: READ_EVERY_MS, staleTime: DASHBOARD_STALE_MS }),
  );
  if (incidents.isError) {
    return (
      <LoadFailedAlert message={t("loadFailed")} error={incidents.error} onRetry={() => void incidents.refetch()} />
    );
  }
  if (incidents.data === undefined) return null;
  const { open, recent } = incidents.data;
  const when = (incident: PlatformIncident) =>
    t("since", { when: instantText(incident.openedAt), count: incident.reports });
  return (
    <section aria-labelledby="system-health-heading" className="flex flex-col gap-3">
      <h2 id="system-health-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      {open.length === 0 ? (
        <Alert>
          <CircleCheckIcon aria-hidden="true" />
          <AlertDescription>{t("allWorking")}</AlertDescription>
        </Alert>
      ) : (
        open.map((incident) => (
          <Alert key={incident.id} variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>{t(`kinds.${kindKeys[incident.kind]}.title`)}</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <span>{t(`kinds.${kindKeys[incident.kind]}.meaning`)}</span>
              {incident.detail !== "" && (
                <span className="numbers break-all">{t("where", { detail: incident.detail })}</span>
              )}
              <span>{when(incident)}</span>
              {incident.kind === "jobs.failed" && <TextLink href={consoleRoutes.jobs}>{t("seeJobs")}</TextLink>}
            </AlertDescription>
          </Alert>
        ))
      )}
      {recent.length > 0 && (
        <ItemGroup aria-label={t("recent")}>
          {recent.map((incident) => (
            <Item key={incident.id} size="sm">
              <ItemContent>
                <ItemTitle>{t(`kinds.${kindKeys[incident.kind]}.title`)}</ItemTitle>
                <ItemDescription>
                  {t("resolved", {
                    from: instantText(incident.openedAt),
                    to: instantText(incident.resolvedAt ?? incident.lastSeenAt),
                  })}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}
