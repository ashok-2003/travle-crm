"use client";

// A lead's seats on departures (release 7a), on the lead's page: the holds still running and the waitlists the lead is on,
// each leading to the departure. Nothing is drawn when there are none.
import { useTranslations } from "next-intl";
import { SectionCard } from "@/bookings/section-card";
import { TextLink } from "@/components/text-link";
import { formatCalendarDay, formatDayTime } from "@/lib/format";
import { departureRoute } from "@/lib/routes";
import { useHolds, useMe } from "@/session/me-context";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";
import { useLeadDepartures } from "./use-departures";

export function LeadDeparturesCard({ leadId }: { leadId: string }) {
  const t = useTranslations("departures.lead");
  const { timeZone } = useMe().organization;
  const modules = useSubscription().data?.modules;
  const shown = useHolds("departures:view") && isOnPlan({ module: "departures" }, modules);
  const found = useLeadDepartures(leadId, shown);
  if (!shown || found.data === undefined || found.data.length === 0) return null;
  return (
    <SectionCard title={t("title")}>
      <ul className="flex flex-col">
        {found.data.map((row) => (
          <li key={`${row.kind}-${row.departureId}`}>
            <TextLink href={departureRoute(row.departureId)}>
              {row.kind === "hold" && row.expiresAt !== null
                ? t("hold", {
                    count: row.seats,
                    title: row.title,
                    day: formatCalendarDay(row.startDate),
                    time: formatDayTime(new Date(row.expiresAt), { timeZone }),
                  })
                : t("waitlist", { count: row.seats, title: row.title, day: formatCalendarDay(row.startDate) })}
            </TextLink>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
