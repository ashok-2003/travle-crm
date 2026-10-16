"use client";

// The schedules that start jobs (ADR 0010), each by its queue, its cron and its zone. A super admin removes one a job
// left behind when it went from the code; the console's own are registered at every start, so they say why they stay.
// Support sees them all, and that only a super admin removes one.
import { CalendarClockIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { CONSOLE_SCHEDULES } from "./platform-queues";
import { RemoveScheduleDialog } from "./remove-schedule-dialog";
import { useSchedules } from "./use-schedules";

export function SchedulesSection() {
  const t = useTranslations("consolePlatform.schedules");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const removable = isSuperAdmin(useStaff());
  const schedules = useSchedules();
  const [removing, setRemoving] = useState<string | null>(null);

  const body = () => {
    if (schedules.data) {
      if (schedules.data.length === 0) return <EmptyState icon={CalendarClockIcon} message={t("empty")} />;
      return (
        <ItemGroup>
          {schedules.data.map((schedule, index) => {
            const theConsoles = CONSOLE_SCHEDULES.has(schedule.queue);
            return (
              <Fragment key={schedule.queue}>
                {index > 0 && <ItemSeparator />}
                <Item size="sm" role="listitem">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="numbers break-all">{schedule.queue}</ItemTitle>
                    <span className="flex flex-wrap gap-x-3 text-caption">
                      <span>
                        <span className="text-muted-foreground">{t("cron")}</span>{" "}
                        <span className="numbers">{schedule.cron}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">{t("timeZone")}</span> <span>{schedule.timeZone}</span>
                      </span>
                    </span>
                    {removable && theConsoles && (
                      <span className="max-w-[65ch] text-caption text-muted-foreground">
                        {tErrors("reasons.SCHEDULE_IS_THE_CONSOLES")}
                      </span>
                    )}
                  </ItemContent>
                  {removable && !theConsoles && (
                    <ItemActions>
                      <Button
                        variant="destructive"
                        aria-label={t("removeFor", { queue: schedule.queue })}
                        onClick={() => {
                          setRemoving(schedule.queue);
                        }}
                      >
                        {t("remove")}
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              </Fragment>
            );
          })}
        </ItemGroup>
      );
    }
    if (schedules.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void schedules.refetch()}
        />
      );
    }
    return <Skeleton role="status" aria-busy="true" aria-label={t("loading")} className="h-32 w-full" />;
  };

  return (
    <section aria-labelledby="job-schedules" className="flex flex-col gap-4">
      <div className="flex max-w-[65ch] flex-col gap-1">
        <h2 id="job-schedules" className="text-section font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted-foreground">{t("intro")}</p>
        {!removable && (
          <p className="flex items-center gap-2 text-label">
            <LockIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            {t("readOnly")}
          </p>
        )}
      </div>
      {body()}
      {removing !== null && (
        <RemoveScheduleDialog
          queue={removing}
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
        />
      )}
    </section>
  );
}
