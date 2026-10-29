"use client";

// The trip a booking is (release 6): the essentials (where and when to report, the driver, the emergency contact), the stays
// with a voucher for each, the itinerary PDF, and the tickets and other files the traveller is shown. A voucher or the PDF is
// numbered when issued and frozen; a change shows it out of date and the old one stays. Nothing is issued by itself.
import type { BookingDetail, Stay } from "@travel-crm/contracts/bookings";
import { FileDownIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details } from "@/components/details";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { AttachmentsPanel } from "@/files/attachments-panel";
import { formatCalendarDay } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { EssentialsDialog } from "./essentials-dialog";
import { StayDialog } from "./stay-dialog";
import { useBookingChanges, useBookingDocument } from "./use-bookings";

function StayRow({ booking, stay, mayEdit }: { booking: BookingDetail; stay: Stay; mayEdit: boolean }) {
  const t = useTranslations("bookings.stays");
  const open = useBookingDocument(booking.id);
  const { removeStay } = useBookingChanges();
  const access = useWriteAccess("change");
  const [removing, setRemoving] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const issued = booking.status === "confirmed" || booking.status === "completed";
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent>
        <ItemTitle>{stay.name}</ItemTitle>
        <ItemDescription>
          {formatCalendarDay(stay.checkIn)} – {formatCalendarDay(stay.checkOut)}
          {stay.address === "" ? "" : ` · ${stay.address}`}
        </ItemDescription>
        {stay.voucher !== null && (
          <ItemDescription className="flex flex-wrap items-center gap-2">
            <span className="numbers">{stay.voucher.number}</span>
            {!stay.voucher.upToDate && <StatusBadge tone="attention">{t("outOfDate")}</StatusBadge>}
          </ItemDescription>
        )}
        <RefusalAlert error={open.error ?? removeStay.error} />
      </ItemContent>
      <ItemActions className="basis-full flex-wrap md:basis-auto">
        {issued && mayEdit && (
          <Button
            variant="outline"
            disabled={open.isPending || !access.allowed}
            onClick={() => {
              open.mutate({ kind: "voucher", stayId: stay.id });
            }}
          >
            <FileDownIcon aria-hidden="true" />
            {stay.voucher === null ? t("issue") : stay.voucher.upToDate ? t("open") : t("issueAgain")}
          </Button>
        )}
        {issued && stay.voucher !== null && !stay.voucher.upToDate && mayEdit && (
          <Button
            variant="ghost"
            disabled={open.isPending}
            onClick={() => {
              if (stay.voucher !== null) open.mutate({ kind: "open", documentId: stay.voucher.documentId });
            }}
          >
            {t("openOld")}
          </Button>
        )}
        {mayEdit && <StayDialog bookingId={booking.id} stay={stay} />}
        {mayEdit && (
          <Button
            ref={removeButton}
            variant="ghost"
            size="icon"
            aria-label={t("removeNamed", { name: stay.name })}
            onClick={() => {
              setRemoving(true);
            }}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        )}
      </ItemActions>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("removeTitle")}
        description={t("removeDescription", { name: stay.name })}
        action={t("remove")}
        request={removeStay}
        returnFocusTo={removeButton}
        onConfirm={() => {
          removeStay.mutate(
            { stayId: stay.id },
            {
              onSuccess: () => {
                setRemoving(false);
              },
            },
          );
        }}
      />
    </Item>
  );
}

export function TripCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.trip");
  const tEssentials = useTranslations("bookings.essentials");
  const mayEdit = useHolds("bookings:edit") && booking.status !== "cancelled";
  const open = useBookingDocument(booking.id);
  const access = useWriteAccess("change");
  const issuedAlready = booking.status === "confirmed" || booking.status === "completed";
  const { essentials } = booking;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{tEssentials("title")}</h3>
          {mayEdit && <EssentialsDialog booking={booking} />}
        </div>
        <Details
          rows={[
            {
              label: tEssentials("report"),
              value:
                essentials.reportingTime === null && essentials.reportingPlace === ""
                  ? tEssentials("notSet")
                  : [essentials.reportingTime, essentials.reportingPlace].filter(Boolean).join(" · "),
            },
            {
              label: tEssentials("driver"),
              value:
                essentials.driverName === "" && essentials.driverPhone === ""
                  ? tEssentials("notSet")
                  : [essentials.driverName, essentials.driverPhone].filter(Boolean).join(" · "),
            },
            {
              label: tEssentials("emergency"),
              value:
                essentials.emergencyName === "" && essentials.emergencyPhone === ""
                  ? tEssentials("notSet")
                  : [essentials.emergencyName, essentials.emergencyPhone].filter(Boolean).join(" · "),
            },
          ]}
        />

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t("stays")}</h3>
          {mayEdit && <StayDialog bookingId={booking.id} stay={null} />}
        </div>
        {booking.stays.length === 0 ? (
          <p className="text-muted-foreground">{t("noStays")}</p>
        ) : (
          <ItemGroup>
            {booking.stays.map((stay) => (
              <StayRow key={stay.id} booking={booking} stay={stay} mayEdit={mayEdit} />
            ))}
          </ItemGroup>
        )}

        <Separator />
        <h3 className="font-semibold">{t("pdf")}</h3>
        {booking.tripPdf !== null && (
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="numbers">{booking.tripPdf.number}</span>
            {!booking.tripPdf.upToDate && <StatusBadge tone="attention">{t("pdfOutOfDate")}</StatusBadge>}
          </p>
        )}
        {mayEdit && issuedAlready ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={open.isPending || !access.allowed}
              onClick={() => {
                open.mutate({ kind: "trip" });
              }}
            >
              <FileDownIcon aria-hidden="true" />
              {booking.tripPdf === null ? t("prepare") : booking.tripPdf.upToDate ? t("openPdf") : t("prepareAgain")}
            </Button>
            {booking.tripPdf !== null && !booking.tripPdf.upToDate && (
              <Button
                variant="ghost"
                disabled={open.isPending}
                onClick={() => {
                  if (booking.tripPdf !== null) open.mutate({ kind: "open", documentId: booking.tripPdf.documentId });
                }}
              >
                {t("openOldPdf")}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{t("pdfAfterConfirm")}</p>
        )}
        <RefusalAlert error={open.error} />

        {mayEdit && (
          <>
            <Separator />
            <h3 className="font-semibold">{t("tickets")}</h3>
            <p className="text-caption text-muted-foreground">{t("ticketsHint")}</p>
            <AttachmentsPanel
              record={{ recordType: "booking_voucher", recordId: booking.id }}
              emptyMessage={t("noTickets")}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
