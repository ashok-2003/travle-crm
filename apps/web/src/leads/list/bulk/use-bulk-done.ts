"use client";

// What follows a bulk change: every list that shows the leads loads again, the choice is cleared, and a toast says how
// many changed (or were removed) and how many were left as they were (out of the person's reach, already closed, or
// kept for a quote or a booking).
import type { BulkResult } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRefreshWork } from "@/data/use-refresh-work";

export function useBulkDone(clear: () => void, removal = false): (result: BulkResult) => Promise<void> {
  const t = useTranslations("leads.bulk");
  const refresh = useRefreshWork();
  return async ({ changed, skipped }) => {
    await refresh();
    clear();
    const counts = { changed, skipped: skipped.length };
    if (removal) toast.success(skipped.length === 0 ? t("removed", { changed }) : t("removedSkipped", counts));
    else toast.success(skipped.length === 0 ? t("done", { changed }) : t("doneSkipped", counts));
  };
}
