"use client";

// What the traveller said about the trip (release 6, spec 2.8): staff ask for it once, after the trip is on; the trip page
// then shows the form. One to three stars tell the lead's owner and the managers at once. Here the stars, the comment, whether
// the agency may share it, and the photos the traveller sent.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./section-card";
import { AttachmentList } from "@/files/attachment-list";
import { useAttachments } from "@/files/use-attachments";
import { formatDay } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useBookingChanges } from "./use-bookings";

function Stars({ value }: { value: number | null }) {
  const t = useTranslations("bookings.feedback");
  if (value === null) return <span>{t("notRated")}</span>;
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={t("stars", { count: value })}>
      <StarIcon aria-hidden="true" className="size-4" />
      <span className="numbers">{value}</span>
    </span>
  );
}

function Photos({ bookingId }: { bookingId: string }) {
  const record = { recordType: "booking_feedback", recordId: bookingId };
  const files = useAttachments(record);
  if (files.data === undefined || files.data.length === 0) return null;
  return <AttachmentList record={record} attachments={files.data} removable={false} />;
}

export function FeedbackCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.feedback");
  const { timeZone } = useMe().organization;
  const mayEdit = useHolds("bookings:edit");
  const access = useWriteAccess("change");
  const { requestFeedback } = useBookingChanges();
  const askable =
    (booking.status === "confirmed" || booking.status === "completed") && booking.feedbackRequestedAt === null;
  const { feedback } = booking;
  if (!askable && booking.feedbackRequestedAt === null && feedback === null) return null;
  return (
    <SectionCard title={t("title")}>
      {askable && mayEdit && (
        <>
          <p className="text-muted-foreground">{t("askBody")}</p>
          <Button
            variant="outline"
            className="self-start"
            disabled={requestFeedback.isPending || !access.allowed}
            onClick={() => {
              requestFeedback.mutate({ bookingId: booking.id });
            }}
          >
            {t("ask")}
          </Button>
          {requestFeedback.data && !requestFeedback.data.sent && (
            <p className="text-muted-foreground">{t("notSent")}</p>
          )}
        </>
      )}
      <RefusalAlert error={requestFeedback.error} />
      {booking.feedbackRequestedAt !== null && feedback === null && (
        <p className="text-muted-foreground">
          {t("waiting", { day: formatDay(new Date(booking.feedbackRequestedAt), { timeZone }) })}
        </p>
      )}
      {feedback !== null && (
        <>
          <Details
            rows={[
              { label: t("overall"), value: <Stars value={feedback.overall} /> },
              { label: t("hotel"), value: <Stars value={feedback.hotel} /> },
              { label: t("transport"), value: <Stars value={feedback.transport} /> },
              { label: t("guide"), value: <Stars value={feedback.guide} /> },
              { label: t("share"), value: feedback.mayShare ? t("mayShare") : t("mayNotShare") },
            ]}
          />
          {feedback.comment !== "" && <p className="break-words whitespace-pre-wrap">{feedback.comment}</p>}
          <Photos bookingId={booking.id} />
        </>
      )}
    </SectionCard>
  );
}
