"use client";

// A booking's money (release 6): the trip's total, what was paid and what is left; the payments due (each Paid once what was
// received covers it), the payments the traveller says they made, waiting to be checked (Confirm or Reject, for whoever records
// payments), the payments received, and, after a cancellation, the refund. The money is the quote's: receipts and the voiding
// of a payment are on the quote's page.
import type { BookingDetail, Claim } from "@travel-crm/contracts/bookings";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./section-card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useDownload } from "@/files/use-download";
import { useTRPCClient } from "@/data/trpc";
import { formatCalendarDay, formatDay } from "@/lib/format";
import { quoteRoute } from "@/lib/routes";
import { useHolds, useMe } from "@/session/me-context";
import { ConfirmClaimDialog, RejectClaimDialog } from "./claim-dialogs";
import { MarkRefundedDialog } from "./refund-dialog";
import { ChangeScheduleDialog } from "./schedule-dialogs";

function ClaimRow({ claim, bookingId, mayCheck }: { claim: Claim; bookingId: string; mayCheck: boolean }) {
  const t = useTranslations("bookings.claims");
  const client = useTRPCClient();
  const { timeZone } = useMe().organization;
  const screenshot = useDownload((attachmentId: string) =>
    client.bookings.files.downloadLink.mutate({ recordType: "payment_claim", recordId: bookingId, attachmentId }),
  );
  const decided =
    claim.status === "confirmed" ? (
      <StatusBadge tone="good">{t("status.confirmed")}</StatusBadge>
    ) : claim.status === "rejected" ? (
      <StatusBadge tone="bad">{t("status.rejected")}</StatusBadge>
    ) : (
      <StatusBadge tone="attention">{t("status.pending")}</StatusBadge>
    );
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent>
        <ItemTitle>
          <span className="numbers">{rupees(claim.amountPaise)}</span> {decided}
        </ItemTitle>
        <ItemDescription>
          {claim.reference === "" ? t("noReference") : t("reference", { reference: claim.reference })}
          {" · "}
          {formatDay(new Date(claim.createdAt), { timeZone })}
          {claim.rejectReason === null ? "" : ` · ${t(`rejectForm.reasons.${claim.rejectReason}`)}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="basis-full flex-wrap md:basis-auto">
        {claim.screenshotAttachmentId !== null && (
          <Button
            variant="outline"
            disabled={screenshot.isPending}
            onClick={() => {
              if (claim.screenshotAttachmentId !== null) screenshot.mutate(claim.screenshotAttachmentId);
            }}
          >
            <ImageIcon aria-hidden="true" />
            {t("screenshot")}
          </Button>
        )}
        {claim.status === "pending" && mayCheck && (
          <>
            <ConfirmClaimDialog claim={claim} />
            <RejectClaimDialog claim={claim} />
          </>
        )}
      </ItemActions>
    </Item>
  );
}

export function PaymentsCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.payments");
  const mayEdit = useHolds("bookings:edit");
  const mayCheck = useHolds("quotes:record_payments");
  const cancelled = booking.status === "cancelled";
  return (
    <SectionCard title={t("title")}>
      <dl className="grid grid-cols-3 gap-3">
        {(
          [
            [cancelled ? "charge" : "total", booking.totalPaise],
            ["paid", booking.paidPaise],
            ["balance", booking.balancePaise],
          ] as const
        ).map(([key, paise]) => (
          <div key={key} className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{t(key)}</dt>
            <dd className="numbers text-section font-semibold">{rupees(paise)}</dd>
          </div>
        ))}
      </dl>

      {booking.claims.length > 0 && (
        <>
          <Separator />
          <h3 className="font-semibold">{t("claims")}</h3>
          <ItemGroup>
            {booking.claims.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} bookingId={booking.id} mayCheck={mayCheck} />
            ))}
          </ItemGroup>
          {!mayCheck && booking.pendingClaims > 0 && (
            <p className="text-caption text-muted-foreground">{t("notYours")}</p>
          )}
        </>
      )}

      {!cancelled && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t("due")}</h3>
            {mayEdit && booking.installments.length > 0 && <ChangeScheduleDialog booking={booking} />}
          </div>
          {booking.installments.length === 0 ? (
            <p className="text-muted-foreground">{t("noInstallments")}</p>
          ) : (
            <ItemGroup>
              {booking.installments.map((due) => (
                <Item key={due.id} size="sm" role="listitem">
                  <ItemContent>
                    <ItemTitle>{due.label}</ItemTitle>
                    <ItemDescription>{t("by", { day: formatCalendarDay(due.dueOn) })}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="numbers">{rupees(due.amountPaise)}</span>
                    <StatusBadge tone={due.paid ? "good" : "attention"}>
                      {due.paid ? t("paidBadge") : t("toPay")}
                    </StatusBadge>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </>
      )}

      <Separator />
      <h3 className="font-semibold">{t("received")}</h3>
      {booking.payments.length === 0 ? (
        <p className="text-muted-foreground">{t("noneReceived")}</p>
      ) : (
        <ItemGroup>
          {booking.payments.map((payment) => (
            <Item key={payment.id} size="sm" role="listitem">
              <ItemContent>
                <ItemTitle className="numbers">{rupees(payment.amountPaise)}</ItemTitle>
                <ItemDescription>
                  {formatCalendarDay(payment.receivedOn)} · {t(`methods.${payment.method}`)}
                  {payment.reference === "" ? "" : ` · ${payment.reference}`}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
      <TextLink href={quoteRoute(booking.quoteId)}>{t("openQuote")}</TextLink>

      {booking.refund !== null && (
        <>
          <Separator />
          <h3 className="font-semibold">{t("refund")}</h3>
          <Item size="sm">
            <ItemContent>
              <ItemTitle>
                <span className="numbers">{rupees(booking.refund.amountPaise)}</span>{" "}
                <StatusBadge tone={booking.refund.status === "refunded" ? "good" : "attention"}>
                  {t(booking.refund.status === "refunded" ? "refunded" : "refundDue")}
                </StatusBadge>
              </ItemTitle>
              {booking.refund.status === "refunded" && booking.refund.refundedOn !== null && (
                <ItemDescription>
                  {formatCalendarDay(booking.refund.refundedOn)}
                  {booking.refund.method === null ? "" : ` · ${t(`methods.${booking.refund.method as "upi"}`)}`}
                  {booking.refund.reference === "" ? "" : ` · ${booking.refund.reference}`}
                </ItemDescription>
              )}
            </ItemContent>
            {booking.refund.status === "due" && mayCheck && (
              <ItemActions>
                <MarkRefundedDialog bookingId={booking.id} />
              </ItemActions>
            )}
          </Item>
        </>
      )}
    </SectionCard>
  );
}
