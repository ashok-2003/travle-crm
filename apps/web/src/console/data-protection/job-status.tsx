"use client";

// What is known of a deletion or an erasure asked for: its result once the log has one; else that it is asked for, or,
// once the job has not reported back in ten minutes (it probably failed, which writes no result), where to look.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { consoleRoutes } from "../routes";

export function JobStatus({ result, queued, gaveUp }: { result: string | null; queued: string; gaveUp: boolean }) {
  const t = useTranslations("consolePlatform.dataProtection");
  return (
    <p role="status" className="max-w-[65ch]">
      {result ?? (gaveUp ? t("waitedTooLong") : queued)}{" "}
      {result === null && gaveUp && (
        <Link
          href={consoleRoutes.jobs}
          className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
        >
          {t("seeJobs")}
        </Link>
      )}
    </p>
  );
}
