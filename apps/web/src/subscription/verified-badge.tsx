"use client";

// The verified tick beside the agency's name (paid-plans spec, part B): a small check badge while the subscription is
// active and paid, never for a trial, a past-due or read-only agency, or the demo. Its card, a popover, names the plan
// and the paid-through day, and gives whoever holds billing:view the way to Plan & billing. Prices are never in it.
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { BadgeCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TextLink } from "@/components/text-link";
import { formatCalendarDay } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHolds, useMe } from "@/session/me-context";
import { useSubscription } from "./use-subscription";
import { isVerified } from "./verified";

/** `onDark` for the sidebar's green, where the tick wears the good tone's pale tint; its dot colour elsewhere. */
export function VerifiedBadge({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const t = useTranslations("subscription.verified");
  const { timeZone } = useMe().organization;
  const seesBilling = useHolds("billing:view");
  const { data } = useSubscription();
  const paidThrough = data?.paidThrough ?? null;
  if (!data || paidThrough === null || !isVerified(data, calendarDateIn(new Date(), timeZone))) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("label", { plan: data.planName })}
          className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-lg align-middle", className)}
        >
          <BadgeCheckIcon
            aria-hidden="true"
            className={cn("size-5", onDark ? "text-status-good-fill" : "text-status-good-dot")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="gap-1">
        <p className="font-medium">{t("plan", { plan: data.planName })}</p>
        <p className="text-muted-foreground">{t("paidTill", { date: formatCalendarDay(paidThrough) })}</p>
        {seesBilling && <TextLink href={routes.plan}>{t("seeBilling")}</TextLink>}
      </PopoverContent>
    </Popover>
  );
}
