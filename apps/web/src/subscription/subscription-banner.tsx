"use client";

// The subscription's banner above every screen (spec 7.3): the trial's last week, payment due with the day read-only
// begins, and read-only itself, each in DESIGN.md's status style (a dot and the words, on the status tint) with the
// organization's calendar days, and for the Owner the next step: a way to contact support. Nothing while
// subscription.get loads or fails: its refusals speak for themselves.
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { brand } from "@travel-crm/brand";
import { useTranslations } from "next-intl";
import { statusToneClasses, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { formatCalendarDate } from "./calendar-date";
import { noticeOf, type SubscriptionNotice } from "./subscription-notice";
import { useSubscription } from "./use-subscription";

/** Neutral for a trial ending, amber for payment due, red for read-only (DESIGN.md's status vocabulary). */
const tones: Record<SubscriptionNotice["kind"], StatusTone> = {
  trialEnding: "neutral",
  pastDue: "attention",
  readOnly: "bad",
};

export function SubscriptionBanner() {
  const t = useTranslations("subscription.banner");
  const me = useMe();
  const { data } = useSubscription();
  const { timeZone } = me.organization;
  const notice = data ? noticeOf(data, calendarDateIn(new Date(), timeZone)) : null;
  if (!notice) return null;

  const day = (date: string) => formatCalendarDate(date, { timeZone });
  const words = () => {
    switch (notice.kind) {
      case "trialEnding":
        return t("trialEnding", { date: day(notice.on) });
      case "pastDue":
        return notice.readOnlyFrom === null ? t("pastDueUndated") : t("pastDue", { date: day(notice.readOnlyFrom) });
      case "readOnly":
        return t("readOnly");
    }
  };
  const tone = statusToneClasses[tones[notice.kind]];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 px-4 text-label", tone.badge)}>
      <p className="flex items-center gap-2 py-2">
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
        {words()}
      </p>
      {/* The next step is the Owner's, who pays: the way to support, whom the brand names. */}
      {me.member.role.isOwner && (
        <Button variant="link" className="px-0" asChild>
          <a href={`mailto:${brand.supportEmail}`}>{t("contactSupport")}</a>
        </Button>
      )}
    </div>
  );
}
