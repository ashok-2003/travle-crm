"use client";

// A lead's bookings on its page (release 6): each with its number, trip and status, opening its own page. Shown only once the
// lead has one, to whoever may see bookings on a plan with them: a booking is made when the customer accepts a quote.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { TextLink } from "@/components/text-link";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { LeadCard } from "@/leads/lead/lead-card";
import { bookingRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";
import { BookingStatusBadge } from "./booking-status";
import { useLeadBookings } from "./use-bookings";

export function LeadBookingsCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("bookings.lead");
  const modules = useSubscription().data?.modules;
  const shown = useHolds("bookings:view") && isOnPlan({ module: "bookings" }, modules);
  const bookings = useLeadBookings(lead.id, shown);
  if (!shown) return null;
  if (bookings.isError) {
    return (
      <LeadCard title={t("title")}>
        <LoadFailedAlert message={t("loadFailed")} error={bookings.error} onRetry={() => void bookings.refetch()} />
      </LeadCard>
    );
  }
  if (bookings.data === undefined || bookings.data.length === 0) return null;
  return (
    <LeadCard title={t("title")}>
      <ItemGroup>
        {bookings.data.map((booking) => (
          <Item key={booking.id} size="sm" role="listitem">
            <ItemContent>
              <ItemTitle>
                <TextLink inline href={bookingRoute(booking.id)}>
                  {booking.title}
                </TextLink>
              </ItemTitle>
              <ItemDescription className="numbers">{booking.number}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <BookingStatusBadge status={booking.status} />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </LeadCard>
  );
}
