"use client";

// A lead's owner (or a task's assignee) in the people tint (DESIGN.md: assignment is violet information, never a
// button), shaped as a badge. A name the page didn't carry is a former member's.
import { useTranslations } from "next-intl";

export function OwnerBadge({ name }: { name: string | null }) {
  const t = useTranslations("leads");
  return (
    <span className="inline-flex min-h-6 items-center rounded-badge bg-people-tint px-2 text-caption font-medium text-people-tint-ink">
      {name ?? t("formerMember")}
    </span>
  );
}
