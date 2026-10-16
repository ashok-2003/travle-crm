"use client";

// An instant as the console shows it: "16 Oct, 4:30 pm" by India's clocks (PLATFORM_TIME_ZONE), with the year when it
// isn't this one (DESIGN.md section 9).
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { formatDay, formatTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "../platform-time-zone";

export function useInstantText(): (iso: string) => string {
  const t = useTranslations("consolePlatform.time");
  return useCallback(
    (iso: string) => {
      const at = new Date(iso);
      return t("dayAndTime", {
        day: formatDay(at, { timeZone: PLATFORM_TIME_ZONE }),
        time: formatTime(at, { timeZone: PLATFORM_TIME_ZONE }),
      });
    },
    [t],
  );
}
