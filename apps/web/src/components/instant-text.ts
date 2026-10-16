"use client";

// An instant as the console shows it: "16 Oct, 4:30 pm" by the platform's clocks (lib/platform-time-zone.ts), with the
// year when it isn't this one (DESIGN.md section 9).
import { useCallback } from "react";
import { formatDayTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";

export function useInstantText(): (iso: string) => string {
  return useCallback((iso: string) => formatDayTime(new Date(iso), { timeZone: PLATFORM_TIME_ZONE }), []);
}
