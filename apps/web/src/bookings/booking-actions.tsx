"use client";

// A booking's actions in one row, as the quote's (bookings revamp): the trip link on WhatsApp, the trip link with Copy, and a
// "⋯" menu for changing the travel date and cancelling. Confirming is in "Needs you", where the booking waits for it. Each is
// for whoever may change bookings.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { EllipsisIcon, LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { WhatsAppLogo } from "@/components/contact-icons";
import { CopyButton } from "@/components/copy-button";
import { GlyphButton } from "@/components/icon-button";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { CancelBookingDialog } from "./cancel-dialog";
import { TravelDateDialog } from "./travel-date-dialog";
import { useBookingChanges } from "./use-bookings";

/** The trip link as WhatsApp shows it, with the words before it. */
const whatsappHref = (phone: string, words: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(words)}`;

export function BookingActions({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.actions");
  const mayEdit = useHolds("bookings:edit");
  const access = useWriteAccess("change");
  const hintId = useId();
  const { tripLink } = useBookingChanges();
  const [link, setLink] = useState<{ path: string; url: string } | null>(null);
  const [dating, setDating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const open = booking.status !== "cancelled";
  const mayCancel = booking.status === "requested" || booking.status === "confirmed";
  // A booking on a departure follows the departure's date.
  const mayDate = open && booking.status !== "completed" && booking.departure === null;
  const gate = { disabled: !access.allowed, "aria-describedby": access.hint === null ? undefined : hintId };
  const share = (then: (shared: { path: string; url: string }) => void) => {
    if (link !== null) {
      then(link);
      return;
    }
    tripLink.mutate(
      { bookingId: booking.id },
      {
        onSuccess: ({ path }) => {
          const shared = { path, url: `${window.location.origin}${path}` };
          setLink(shared);
          then(shared);
        },
      },
    );
  };
  if (!mayEdit || !open) return null;
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("label")} className="flex flex-wrap items-center gap-3">
        <GlyphButton
          variant="send"
          aria-label={t("sendWhatsapp")}
          {...gate}
          disabled={gate.disabled || tripLink.isPending}
          onClick={() => {
            share(({ url }) => {
              if (booking.customerPhone === null) {
                toast.info(t("noPhone"));
                return;
              }
              const words = t("whatsappWords", { name: booking.customerName, title: booking.title, link: url });
              window.open(whatsappHref(booking.customerPhone, words), "_blank", "noopener");
            });
          }}
        >
          <WhatsAppLogo className="size-4" />
        </GlyphButton>
        {link === null ? (
          <Button
            variant="link"
            {...gate}
            disabled={gate.disabled || tripLink.isPending}
            onClick={() => {
              share(() => undefined);
            }}
          >
            <LinkIcon aria-hidden="true" />
            {t("makeLink")}
          </Button>
        ) : (
          <>
            <TextLink href={link.path} newTab>
              <LinkIcon aria-hidden="true" />
              {t("tripLink")}
            </TextLink>
            <CopyButton value={link.url} label={t("copyLink")} iconOnly />
          </>
        )}
        {(mayDate || mayCancel) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={menuButton} variant="ghost" size="icon" aria-label={t("more")}>
                <EllipsisIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {mayDate && (
                <DropdownMenuItem
                  disabled={gate.disabled}
                  onSelect={() => {
                    setDating(true);
                  }}
                >
                  {t("changeDate")}
                </DropdownMenuItem>
              )}
              {mayCancel && (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={gate.disabled}
                  onSelect={() => {
                    setCancelling(true);
                  }}
                >
                  {t("cancel")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <WriteHint id={hintId} hint={access.hint} />
      <RefusalAlert error={tripLink.error} />
      {mayDate && (
        <TravelDateDialog booking={booking} held={{ open: dating, setOpen: setDating }} returnFocusTo={menuButton} />
      )}
      {mayCancel && (
        <CancelBookingDialog
          bookingId={booking.id}
          held={{ open: cancelling, setOpen: setCancelling }}
          returnFocusTo={menuButton}
        />
      )}
    </div>
  );
}
