// The dashboard's breakdowns of the period's new leads: by first source (with how many are Won), by the stage they are
// in now (each in its stage's colour), by destination, and by how long they waited for a first reply.
import { responseBuckets, type Dashboard } from "@travel-crm/contracts/insights";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stageTones } from "@/leads/stage-badge";
import { BarList } from "./bar-list";

function BreakdownCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SourcesCard({ bySource }: { bySource: Dashboard["bySource"] }) {
  const t = useTranslations("dashboard.bySource");
  const tSources = useTranslations("leads.sources");
  return (
    <BreakdownCard title={t("title")}>
      <BarList
        rows={bySource.map(({ source, leads, won }) => ({
          key: source,
          label: tSources(source),
          value: leads,
          detail: t("won", { count: won }),
        }))}
      />
    </BreakdownCard>
  );
}

export function StagesCard({ byStage }: { byStage: Dashboard["byStage"] }) {
  const t = useTranslations("dashboard.byStage");
  const tStages = useTranslations("leads.stages");
  return (
    <BreakdownCard title={t("title")}>
      <BarList
        rows={byStage.map(({ stage, leads }) => ({
          key: stage,
          label: tStages(stage),
          value: leads,
          barClassName: stageTones[stage].dot,
        }))}
      />
    </BreakdownCard>
  );
}

export function DestinationsCard({ topDestinations }: { topDestinations: Dashboard["topDestinations"] }) {
  const t = useTranslations("dashboard.destinations");
  return (
    <BreakdownCard title={t("title")}>
      {topDestinations.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <BarList rows={topDestinations.map(({ name, leads }) => ({ key: name, label: name, value: leads }))} />
      )}
    </BreakdownCard>
  );
}

export function ResponseTimesCard({ responseTimes }: { responseTimes: Dashboard["responseTimes"] }) {
  const t = useTranslations("dashboard.responseTimes");
  const leadsIn = new Map(responseTimes.map(({ bucket, leads }) => [bucket, leads]));
  return (
    <BreakdownCard title={t("title")}>
      <BarList
        rows={responseBuckets.map((bucket) => ({
          key: bucket,
          label: t(`buckets.${bucket}`),
          value: leadsIn.get(bucket) ?? 0,
        }))}
      />
    </BreakdownCard>
  );
}
