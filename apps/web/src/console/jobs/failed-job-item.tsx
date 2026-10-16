"use client";

// One failed job as the api gives it (ADR 0010: ids and codes only): its queue, when it failed and after how many
// attempts, its data and its error; and a way to run it again, except for the platform's purge, erasure and export,
// which a super admin asks for again so that every check is made again. The screen says so beside the button.
import type { FailedJobOutput } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Item, ItemContent } from "@/components/ui/item";
import { useInstantText } from "@/components/instant-text";
import { ASKED_FOR_AGAIN_QUEUES } from "./platform-queues";
import { useRetryJob } from "./use-failed-jobs";

export function FailedJobItem({ job }: { job: FailedJobOutput }) {
  const t = useTranslations("consolePlatform.jobs");
  const tErrors = useTranslations("errors");
  const instantText = useInstantText();
  const retry = useRetryJob();
  const reasonId = useId();
  const retryable = !ASKED_FOR_AGAIN_QUEUES.has(job.queue);
  const data = Object.entries(job.data);
  return (
    <Item size="sm" role="listitem">
      <ItemContent className="gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="numbers font-medium break-all">{job.queue}</span>
          <span className="flex flex-wrap gap-x-3 text-caption text-muted-foreground">
            <span className="numbers">
              {job.failedAt === null ? t("noTime") : t("failedAt", { when: instantText(job.failedAt) })}
            </span>
            <span className="numbers">{t("attempts", { count: job.attempts })}</span>
          </span>
        </div>
        {data.length === 0 ? (
          <p className="text-caption text-muted-foreground">{t("noData")}</p>
        ) : (
          <dl aria-label={t("data")} className="flex flex-col gap-0.5 text-caption">
            {data.map(([key, value]) => (
              <div key={key} className="flex flex-wrap gap-x-2">
                <dt className="numbers text-muted-foreground">{key}</dt>
                <dd className="numbers break-all">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="flex flex-col gap-0.5">
          <span className="text-caption text-muted-foreground">{t("error")}</span>
          <span className="numbers text-label break-all whitespace-pre-wrap">{job.error}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="outline"
            disabled={!retryable || retry.isPending}
            aria-label={t("retryFor", { queue: job.queue, id: job.id })}
            aria-describedby={retryable ? undefined : reasonId}
            onClick={() => {
              retry.mutate({ queue: job.queue, jobId: job.id });
            }}
          >
            {t("retry")}
          </Button>
          {!retryable && (
            <span id={reasonId} className="max-w-[65ch] text-caption text-muted-foreground">
              {tErrors("reasons.NOT_RETRYABLE")}
            </span>
          )}
        </div>
      </ItemContent>
    </Item>
  );
}
