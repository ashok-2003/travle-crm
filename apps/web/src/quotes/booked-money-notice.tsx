"use client";

// In place of a booked quote's money: the quote's payments are on its booking now, one tap away for whoever may open bookings.
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bookingRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";

export function BookedMoneyNotice({ booking }: { booking: { id: string; number: string } }) {
  const t = useTranslations("quotes.money");
  const mayOpen = useHolds("bookings:view");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>{t("onBooking", { number: booking.number })}</p>
        {mayOpen && <TextLink href={bookingRoute(booking.id)}>{t("openBooking")}</TextLink>}
      </CardContent>
    </Card>
  );
}
