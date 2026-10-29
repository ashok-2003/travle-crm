"use client";

// The bookings the AI took on a lead (the owner, 2026-10-29): what the customer said yes to, as the AI took it down,
// whether it waits for payment or the customer sent a proof (each screenshot or PDF opens from here), and, for whoever
// may work the lead, the decision: the payment is in (the lead is won) or the booking is off. Nothing until there is one.
import type { AiBooking } from "@travel-crm/contracts/ai";
import { CalendarCheckIcon, ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details } from "@/components/details";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useTRPCClient } from "@/data/trpc";
import { formatDayTime } from "@/lib/format";
import { openInNewTab } from "@/lib/open-in-new-tab";
import { useErrorMessage } from "@/lib/error-message";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useLeadBookings, useSetBookingStatus } from "./use-ai";

const statusTone: Record<AiBooking["status"], StatusTone> = {
  awaiting_payment: "attention",
  proof_received: "attention",
  confirmed: "good",
  cancelled: "neutral",
};

function BookingBlock({ booking }: { booking: AiBooking }) {
  const t = useTranslations("ai.bookings");
  const client = useTRPCClient();
  const { apiError } = useErrorMessage();
  const { timeZone } = useMe().organization;
  const canDecide = useHolds("leads:edit");
  const access = useWriteAccess("change");
  const decide = useSetBookingStatus();
  const [confirming, setConfirming] = useState<"confirmed" | "cancelled" | null>(null);
  const open = booking.status === "awaiting_payment" || booking.status === "proof_received";
  const openProof = (messageId: string) => {
    openInNewTab(() => client.inbox.mediaUrl.query({ messageId })).catch((error: unknown) => {
      toast.error(apiError(error));
    });
  };
  const d = booking.details;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{booking.summary}</p>
        <StatusBadge tone={statusTone[booking.status]}>{t(`status.${booking.status}`)}</StatusBadge>
      </div>
      <Details
        rows={[
          { label: t("package"), value: d.package || "—" },
          { label: t("dates"), value: d.dates || "—" },
          { label: t("travellers"), value: d.travellers || "—" },
          { label: t("pickup"), value: d.pickup || "—" },
          { label: t("amount"), value: d.amount || "—" },
          { label: t("taken"), value: formatDayTime(new Date(booking.createdAt), { timeZone }) },
        ]}
      />
      {booking.proofs.length === 0 ? (
        open && <p className="text-caption text-muted-foreground">{t("noProof")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {booking.proofs.map((proof, index) => (
            <Button
              key={proof.messageId}
              variant="outline"
              onClick={() => {
                openProof(proof.messageId);
              }}
            >
              <ImageIcon aria-hidden="true" />
              {t("proof", { number: index + 1, when: formatDayTime(new Date(proof.at), { timeZone }) })}
            </Button>
          ))}
        </div>
      )}
      {open && canDecide && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!access.allowed}
            onClick={() => {
              setConfirming("confirmed");
            }}
          >
            {t("confirm")}
          </Button>
          <Button
            variant="outline"
            disabled={!access.allowed}
            onClick={() => {
              setConfirming("cancelled");
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
        title={confirming === "cancelled" ? t("cancelTitle") : t("confirmTitle")}
        description={confirming === "cancelled" ? t("cancelDescription") : t("confirmDescription")}
        action={confirming === "cancelled" ? t("cancel") : t("confirm")}
        request={decide}
        onConfirm={() => {
          if (confirming === null) return;
          decide.mutate(
            { bookingId: booking.id, status: confirming },
            {
              onSuccess: () => {
                toast.success(confirming === "cancelled" ? t("cancelled") : t("confirmed"));
                setConfirming(null);
              },
            },
          );
        }}
      />
    </div>
  );
}

export function LeadBookings({ leadId }: { leadId: string }) {
  const t = useTranslations("ai.bookings");
  const bookings = useLeadBookings(leadId).data ?? [];
  if (bookings.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheckIcon aria-hidden="true" className="size-4 text-primary" />
          <h3>{t("title")}</h3>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
          <StatusBadge tone="neutral">{t("count", { count: bookings.length })}</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {bookings.map((booking, index) => (
          <div key={booking.id} className="flex flex-col gap-4">
            {index > 0 && <Separator />}
            <BookingBlock booking={booking} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
