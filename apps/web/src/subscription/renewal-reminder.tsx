"use client";

// A quiet line in the banner area for whoever holds billing:view (the Owner): the plan is paid till a day within the
// week, so contact us to renew. × hides it on this device until the paid-through day changes (a payment moves it);
// the choice is kept in the browser's storage, which may be refused, and then the line simply shows again.
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { renewalReminderOf } from "./subscription-notice";
import { useSubscription } from "./use-subscription";

const keyFor = (paidThrough: string) => `renewal-reminder-hidden:${paidThrough}`;

function wasDismissed(paidThrough: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(paidThrough)) !== null;
  } catch {
    return false;
  }
}

function remember(paidThrough: string): void {
  try {
    window.localStorage.setItem(keyFor(paidThrough), "1");
  } catch {
    // Storage is refused (a private window): the line comes back at the next visit.
  }
}

export function RenewalReminder() {
  const t = useTranslations("subscription.renewal");
  const { timeZone } = useMe().organization;
  const seesBilling = useHolds("billing:view");
  const { data } = useSubscription();
  const [hidden, setHidden] = useState<string | null>(null);
  const paidThrough = seesBilling && data ? renewalReminderOf(data, calendarDateIn(new Date(), timeZone)) : null;
  if (paidThrough === null || hidden === paidThrough || wasDismissed(paidThrough)) return null;
  return (
    <Item variant="muted" size="sm" className="gap-2 rounded-none py-0 pr-1">
      <ItemContent className="text-label">
        {t("line", { plan: data?.planName ?? "", date: formatCalendarDay(paidThrough) })}
      </ItemContent>
      <ItemActions>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("hide")}
          onClick={() => {
            remember(paidThrough);
            setHidden(paidThrough);
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </ItemActions>
    </Item>
  );
}
