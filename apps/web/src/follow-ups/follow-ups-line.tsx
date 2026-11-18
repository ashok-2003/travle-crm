"use client";

// One line on My tasks and Home: how many follow-ups are due, how many of those the customer answered, and the way to
// Follow-ups. Nothing when none are due, and nothing for a member who may not see leads (the list asks for that).
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useFollowUpsDue } from "./use-follow-ups-due";

function Line() {
  const t = useTranslations("tasks.followUps");
  const counts = useFollowUpsDue();
  if (counts === undefined || counts.due === 0) return null;
  return (
    <TextLink href={routes.followUps}>
      <span className="numbers">{t("line", counts)}</span>
    </TextLink>
  );
}

export function FollowUpsLine() {
  return useHolds("leads:view") ? <Line /> : null;
}
