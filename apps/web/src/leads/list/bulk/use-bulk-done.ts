"use client";

// What follows a bulk change: every list that shows the leads loads again, the choice is cleared, and a toast says how
// many changed and how many were left as they were (out of the person's reach, or already closed).
import type { BulkResult } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRefreshWork } from "@/data/use-refresh-work";

export function useBulkDone(clear: () => void): (result: BulkResult) => Promise<void> {
  const t = useTranslations("leads.bulk");
  const refresh = useRefreshWork();
  return async ({ changed, skipped }) => {
    await refresh();
    clear();
    toast.success(
      skipped.length === 0 ? t("done", { changed }) : t("doneSkipped", { changed, skipped: skipped.length }),
    );
  };
}
