"use client";

// One line on My tasks and Home: how many follow-ups are due, how many of those the customer answered, and the way to
// Follow-ups. Nothing when none are due (or the member may not see leads: the hook then has no counts).
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { routes } from "@/lib/routes";
import { useFollowUpsDue } from "./use-follow-ups-due";

export function FollowUpsLine() {
  const t = useTranslations("tasks.followUps");
  const counts = useFollowUpsDue();
  if (counts === undefined || counts.due === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2">
      <span>{t("line", counts)}</span>
      <TextLink inline href={routes.followUps}>
        {t("openFollowUps")}
      </TextLink>
    </p>
  );
}
