"use client";

// One organization's figures on the dashboard: days left, seats used of the limit, last activity and this month's
// counts, in Indian formats, the dates as India's clocks show them. The numbers alone are mono, the words around them
// in the text's own face (DESIGN.md section 3).
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useCallback, type ReactNode } from "react";
import { formatCount, formatDay } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";

export interface OverviewFigures {
  daysLeft: ReactNode;
  seats: ReactNode;
  lastActive: ReactNode;
  changes: ReactNode;
  documents: ReactNode;
}

const numbers = (chunks: ReactNode) => <span className="numbers">{chunks}</span>;

export function useOverviewFigures(): (organization: OrganizationOverview) => OverviewFigures {
  const t = useTranslations("console.dashboard");
  return useCallback(
    ({ daysLeft, seats, lastActiveAt, thisMonth }: OrganizationOverview) => ({
      daysLeft: daysLeft === null ? t("noChangeDue") : t.rich("daysLeft", { count: daysLeft, n: numbers }),
      seats:
        seats.limit === null
          ? t.rich("seatsNoLimit", { used: formatCount(seats.used), n: numbers })
          : t.rich("seats", { used: formatCount(seats.used), limit: formatCount(seats.limit), n: numbers }),
      lastActive:
        lastActiveAt === null ? t("neverActive") : formatDay(new Date(lastActiveAt), { timeZone: PLATFORM_TIME_ZONE }),
      changes: numbers(formatCount(thisMonth.changes)),
      documents: numbers(formatCount(thisMonth.documentsIssued)),
    }),
    [t],
  );
}
