"use client";

// What is known of a deletion or an erasure asked for: its result once the log has one; else that it is asked for, or,
// once the job has not reported back in ten minutes (it probably failed, which writes no result), where to look.
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { consoleRoutes } from "../routes";

export function JobStatus({
  id,
  result,
  queued,
  gaveUp,
}: {
  /** For a button that is disabled meanwhile to point at, as its reason. */
  id?: string;
  result: string | null;
  queued: string;
  gaveUp: boolean;
}) {
  const t = useTranslations("consolePlatform.dataProtection");
  return (
    <p id={id} role="status" className="max-w-[65ch]">
      {result ?? (gaveUp ? t("waitedTooLong") : queued)}{" "}
      {result === null && gaveUp && <TextLink href={consoleRoutes.jobs}>{t("seeJobs")}</TextLink>}
    </p>
  );
}
