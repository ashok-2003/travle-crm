"use client";

// The payments the traveller says they made, on the booking's money (release 6): each with its screenshot and, for whoever
// records payments, Confirm or Reject.
import type { BookingDetail, Claim } from "@travel-crm/contracts/bookings";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useTRPCClient } from "@/data/trpc";
import { useDownload } from "@/files/use-download";
import { formatDay } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { ConfirmClaimDialog, RejectClaimDialog } from "./claim-dialogs";

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

export function ClaimsSection({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.payments");
  const mayCheck = useHolds("quotes:record_payments");
  if (booking.claims.length === 0) return null;
  return (
    <>
      <Separator />
      <h3 className="font-semibold">{t("claims")}</h3>
      <ItemGroup>
        {booking.claims.map((claim) => (
          <ClaimRow key={claim.id} claim={claim} bookingId={booking.id} mayCheck={mayCheck} />
        ))}
      </ItemGroup>
      {!mayCheck && booking.pendingClaims > 0 && <p className="text-caption text-muted-foreground">{t("notYours")}</p>}
    </>
  );
}
