"use client";

// A quote's departure (release 7a): the batch a draft quote books seats on, whose first day is the quote's. "Add to
// departure" picks one of the open upcoming batches; a sent quote only says which. When the traveller accepts, the booking
// takes the seats and turns the lead's hold into the booking.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formatCalendarDay } from "@/lib/format";
import { departureRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useDepartureChanges, useDepartureList } from "./use-departures";

export function QuoteDepartureCard({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("departures.quote");
  const seesDepartures = useHolds("departures:view");
  const mayEditQuote = useHolds("quotes:edit");
  const mayChange = seesDepartures && mayEditQuote && quote.status === "draft";
  const changes = useDepartureChanges();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState("");
  const list = useDepartureList("upcoming", open);
  if (!seesDepartures || (quote.departure === null && !mayChange)) return null;
  const options = (list.data ?? []).filter((departure) => departure.status === "open");
  return (
    <SectionCard title={t("title")}>
      {quote.departure === null ? null : (
        <p>
          <TextLink inline href={departureRoute(quote.departure.id)}>
            {t("on", { title: quote.departure.title, day: formatCalendarDay(quote.departure.startDate) })}
          </TextLink>
        </p>
      )}
      {quote.departure !== null && <p className="text-muted-foreground">{t("onDescription")}</p>}
      <RefusalAlert error={changes.setQuoteDeparture.error} />
      {mayChange && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(true);
            }}
          >
            {quote.departure === null ? t("add") : t("change")}
          </Button>
          {quote.departure !== null && (
            <Button
              variant="ghost"
              disabled={changes.setQuoteDeparture.isPending}
              onClick={() => {
                changes.setQuoteDeparture.mutate(
                  { quoteId: quote.id, departureId: null },
                  { onSuccess: () => toast.success(t("removed")) },
                );
              }}
            >
              {t("remove")}
            </Button>
          )}
        </div>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) changes.setQuoteDeparture.reset();
          setOpen(next);
        }}
        busy={changes.setQuoteDeparture.isPending}
        title={t("dialogTitle")}
        description={t("dialogDescription")}
        footer={
          <Button
            disabled={chosen === "" || changes.setQuoteDeparture.isPending}
            onClick={() => {
              changes.setQuoteDeparture.mutate(
                { quoteId: quote.id, departureId: chosen },
                {
                  onSuccess: () => {
                    toast.success(t("saved"));
                    setOpen(false);
                  },
                },
              );
            }}
          >
            {changes.setQuoteDeparture.isPending && <Spinner />}
            {changes.setQuoteDeparture.isPending ? t("saving") : t("save")}
          </Button>
        }
      >
        {options.length === 0 && list.data !== undefined ? (
          <p className="text-muted-foreground">{t("none")}</p>
        ) : (
          <Field>
            <FieldLabel htmlFor="quote-departure">{t("departure")}</FieldLabel>
            <Select value={chosen} onValueChange={setChosen}>
              <SelectTrigger id="quote-departure" className="w-full">
                <SelectValue placeholder={t("choose")} />
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map((departure) => (
                  <SelectItem key={departure.id} value={departure.id}>
                    {departure.title}, {formatCalendarDay(departure.startDate)} (
                    {t("freeSeats", { free: departure.free })})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <RefusalAlert error={changes.setQuoteDeparture.error} />
      </ResponsiveDialog>
    </SectionCard>
  );
}
