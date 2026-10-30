"use client";

// The bookings (step 6, P0): every accepted quote, newest first, with its price before GST, its costs, its profit and
// margin, what the customer still owes and what the agency still owes its suppliers. Each opens its quote, where the
// costs are entered.
import { BriefcaseIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { rupees } from "@/components/forms/money-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDay } from "@/lib/format";
import { ShowMoreButton } from "@/components/show-more-button";
import { quoteRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useBookings } from "./use-finance";

export const marginText = (basisPoints: number | null) =>
  basisPoints === null ? "" : `${(basisPoints / 100).toFixed(1)}%`;

export function BookingsTable() {
  const t = useTranslations("finance.bookings");
  const bookings = useBookings();
  if (bookings.items === undefined) {
    return bookings.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={bookings.error}
        retryLabel={t("retry")}
        onRetry={() => void bookings.refetch()}
      />
    ) : (
      <LoadingRows shape="table" columns={6} label={t("loading")} />
    );
  }
  if (bookings.items.length === 0) return <EmptyState icon={BriefcaseIcon} message={t("empty")} />;
  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.booking")}</TableHead>
            <TableHead className="text-right">{t("columns.revenue")}</TableHead>
            <TableHead className="text-right">{t("columns.cost")}</TableHead>
            <TableHead className="text-right">{t("columns.profit")}</TableHead>
            <TableHead className="text-right">{t("columns.customerOwes")}</TableHead>
            <TableHead className="text-right">{t("columns.youOwe")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.items.map((booking) => (
            <TableRow key={booking.quoteId}>
              <TableCell>
                <TextLink inline href={quoteRoute(booking.quoteId)}>
                  {booking.title}
                </TextLink>
                <p className="text-caption text-muted-foreground">
                  {booking.customerName}
                  {booking.cancelled ? ` · ${t("cancelled")}` : ""}
                  {booking.startDate === null
                    ? ""
                    : ` · ${t("travels", { day: formatCalendarDay(booking.startDate) })}`}
                </p>
              </TableCell>
              <TableCell className="numbers text-right">{rupees(booking.revenuePaise)}</TableCell>
              <TableCell className="numbers text-right">{rupees(booking.costPaise)}</TableCell>
              <TableCell
                className={cn("numbers text-right font-semibold", booking.profitPaise < 0 && "text-status-bad-ink")}
              >
                {rupees(booking.profitPaise)}
                <span className="block text-caption font-normal text-muted-foreground">
                  {marginText(booking.marginBasisPoints)}
                </span>
              </TableCell>
              <TableCell className="numbers text-right">{rupees(booking.balancePaise)}</TableCell>
              <TableCell className="numbers text-right">{rupees(booking.owedPaise)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ShowMoreButton pages={bookings} label={t("showMore")} />
    </div>
  );
}
