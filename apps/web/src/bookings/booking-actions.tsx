"use client";

// A booking's actions, under its heading (release 6): Confirm for one waiting for the agency; the traveller's link (copied, or
// sent on WhatsApp); and Cancel while it is requested or confirmed. Each is for whoever may change bookings.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { LinkIcon, MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { CancelBookingDialog } from "./cancel-dialog";
import { ConfirmBookingDialog } from "./schedule-dialogs";
import { useBookingChanges } from "./use-bookings";

/** The trip link as WhatsApp shows it, with the words before it. */
const whatsappHref = (phone: string, words: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(words)}`;

export function BookingActions({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.actions");
  const mayEdit = useHolds("bookings:edit");
  const access = useWriteAccess("change");
  const { tripLink } = useBookingChanges();
  const [link, setLink] = useState<string | null>(null);
  const open = booking.status !== "cancelled";
  const share = (then: (url: string) => void) => {
    if (link !== null) {
      then(link);
      return;
    }
    tripLink.mutate(
      { bookingId: booking.id },
      {
        onSuccess: ({ path }) => {
          const url = `${window.location.origin}${path}`;
          setLink(url);
          then(url);
        },
      },
    );
  };
  if (!mayEdit) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {booking.status === "requested" && <ConfirmBookingDialog booking={booking} />}
        {open && (
          <Button
            variant="send"
            disabled={tripLink.isPending || !access.allowed}
            onClick={() => {
              share((url) => {
                if (booking.customerPhone === null) {
                  toast.info(t("noPhone"));
                  return;
                }
                const words = t("whatsappWords", { name: booking.customerName, title: booking.title, link: url });
                window.open(whatsappHref(booking.customerPhone, words), "_blank", "noopener");
              });
            }}
          >
            <MessageCircleIcon aria-hidden="true" />
            {t("sendWhatsapp")}
          </Button>
        )}
        {open && (
          <Button
            variant="outline"
            disabled={tripLink.isPending || !access.allowed}
            onClick={() => {
              share(() => undefined);
            }}
          >
            <LinkIcon aria-hidden="true" />
            {t("makeLink")}
          </Button>
        )}
        {(booking.status === "requested" || booking.status === "confirmed") && (
          <CancelBookingDialog bookingId={booking.id} />
        )}
      </div>
      {link !== null && (
        <div className="flex max-w-xl items-center gap-2">
          <Input readOnly value={link} aria-label={t("linkLabel")} className="numbers" />
          <CopyButton value={link} label={t("copyLink")} />
        </div>
      )}
      <RefusalAlert error={tripLink.error} />
    </div>
  );
}
