"use client";

// The failed jobs (spec 9.1: "after the last retry, a job lands in a failed-jobs list in the platform console"),
// newest first and a page at a time, every queue's or one queue's. Loading shows rows of skeleton; an empty list
// says so, for the queue when one is chosen; a failure says so with a Retry.
import { CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { FailedJobItem } from "./failed-job-item";
import { QueueFilter } from "./queue-filter";
import { useFailedJobs } from "./use-failed-jobs";

export function FailedJobsSection() {
  const t = useTranslations("consolePlatform.jobs");
  const tCommon = useTranslations("common");
  const [queue, setQueue] = useState<string | null>(null);
  const failed = useFailedJobs(queue);
  const { jobs } = failed;

  let content;
  if (jobs === undefined) {
    content = failed.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void failed.refetch()} />
    ) : (
      <LoadingRows rows={3} shape="twoLines" label={t("loading")} />
    );
  } else if (jobs.length === 0) {
    content = <EmptyState icon={CircleCheckIcon} message={queue === null ? t("empty") : t("emptyQueue", { queue })} />;
  } else {
    content = (
      <>
        <ItemGroup>
          {jobs.map((job, index) => (
            <Fragment key={`${job.queue}:${job.id}`}>
              {index > 0 && <ItemSeparator />}
              <FailedJobItem job={job} />
            </Fragment>
          ))}
        </ItemGroup>
        <ShowMoreButton pages={failed} label={t("showMore")} />
      </>
    );
  }

  return (
    <section aria-labelledby="failed-jobs" className="flex flex-col gap-4">
      <h2 id="failed-jobs" className="text-section font-semibold">
        {t("failedTitle")}
      </h2>
      <QueueFilter queue={queue} onChange={setQueue} />
      {content}
    </section>
  );
}
