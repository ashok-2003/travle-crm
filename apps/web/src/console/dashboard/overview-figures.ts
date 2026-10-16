"use client";

// One organization's figures on the dashboard, as words: days left, seats used of the limit, last activity and this
// month's counts, in Indian formats, the dates as India's clocks show them.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { formatCount, formatDay } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";

export interface OverviewFigures {
  daysLeft: string;
  seats: string;
  lastActive: string;
  changes: string;
  documents: string;
}

export function useOverviewFigures(): (organization: OrganizationOverview) => OverviewFigures {
  const t = useTranslations("console.dashboard");
  return useCallback(
    ({ daysLeft, seats, lastActiveAt, thisMonth }: OrganizationOverview) => ({
      daysLeft: daysLeft === null ? t("noChangeDue") : t("daysLeft", { count: daysLeft }),
      seats:
        seats.limit === null
          ? t("seatsNoLimit", { used: formatCount(seats.used) })
          : t("seats", { used: formatCount(seats.used), limit: formatCount(seats.limit) }),
      lastActive:
        lastActiveAt === null ? t("neverActive") : formatDay(new Date(lastActiveAt), { timeZone: PLATFORM_TIME_ZONE }),
      changes: formatCount(thisMonth.changes),
      documents: formatCount(thisMonth.documentsIssued),
    }),
    [t],
  );
}
