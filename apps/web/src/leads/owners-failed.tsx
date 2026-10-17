"use client";

// Said under an owner or assignee picker when the people who can work leads (leads.owners) didn't load, with Try again
// (LoadFailedAlert); nothing while they did. The picker works on meanwhile with what it has (the member themselves,
// or anyone).
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import type { useLeadOwners } from "./use-lead-owners";

export function OwnersFailed({ owners }: { owners: ReturnType<typeof useLeadOwners> }) {
  const t = useTranslations("leads");
  if (!owners.isError) return null;
  return <LoadFailedAlert message={t("ownersFailed")} error={owners.error} onRetry={() => void owners.refetch()} />;
}
