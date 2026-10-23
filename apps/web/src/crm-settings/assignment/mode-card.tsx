"use client";

// How new leads are given out (release 4, spec 3.1): the Owner, turns, or the fewest open leads, and for the last two
// the pool of people who take them, each with their away state. An empty pool says new leads will wait in Unassigned.
import { assignmentModes, type AssignmentMode, type LeadWorker } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ChoiceGroup, type ChoiceOption } from "@/components/forms/choice-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { formatDay } from "@/lib/format";

export function ModeCard({
  mode,
  onMode,
  pool,
  onPool,
  workers,
  awayOf,
  timeZone,
}: {
  mode: string;
  onMode: (mode: string) => void;
  pool: ReadonlySet<string>;
  onPool: (pool: Set<string>) => void;
  workers: readonly LeadWorker[];
  /** When each person in the pool is away until, if they are. */
  awayOf: ReadonlyMap<string, string | null>;
  timeZone: string;
}) {
  const t = useTranslations("settings.assignment");
  const options: ChoiceOption[] = assignmentModes.map((each) => ({
    value: each,
    label: t(`mode.${each}`),
    description: t(`mode.${each}Hint`),
    ...(each === "owner"
      ? {}
      : {
          info: {
            term: each === "turns" ? t("mode.turns") : t("mode.fewest_openTerm"),
            meaning: each === "turns" ? t("mode.turnsMeaning") : t("mode.fewest_openMeaning"),
          },
        }),
  }));
  const pooled = (["turns", "fewest_open"] satisfies AssignmentMode[]).some((each) => each === mode);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mode.label")}</CardTitle>
        <CardDescription>{t("mode.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ChoiceGroup legend={t("mode.label")} options={options} value={mode} onChange={onMode} />
        {pooled && (
          <section aria-labelledby="pool-heading" className="flex flex-col gap-3">
            <div>
              <h3 id="pool-heading" className="font-medium">
                {t("pool.label")}
              </h3>
              <p className="text-label text-muted-foreground">{t("pool.hint")}</p>
            </div>
            {pool.size === 0 && (
              <Alert>
                <AlertDescription>{t("pool.empty")}</AlertDescription>
              </Alert>
            )}
            <ItemGroup>
              {workers.map((worker, index) => {
                const away = awayOf.get(worker.userId);
                const awayNow = away !== undefined && away !== null && new Date(away) > new Date();
                return (
                  <Fragment key={worker.userId}>
                    {index > 0 && <ItemSeparator />}
                    <Item size="sm">
                      <ItemMedia>
                        <Checkbox
                          id={`pool-${worker.userId}`}
                          checked={pool.has(worker.userId)}
                          onCheckedChange={(checked) => {
                            const next = new Set(pool);
                            if (checked === true) next.add(worker.userId);
                            else next.delete(worker.userId);
                            onPool(next);
                          }}
                        />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>
                          <Label htmlFor={`pool-${worker.userId}`}>{worker.name}</Label>
                        </ItemTitle>
                        {awayNow && (
                          <ItemDescription>
                            {t("pool.away", { day: formatDay(new Date(away), { timeZone }) })}
                          </ItemDescription>
                        )}
                      </ItemContent>
                    </Item>
                  </Fragment>
                );
              })}
            </ItemGroup>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
