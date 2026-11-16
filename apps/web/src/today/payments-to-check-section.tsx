"use client";

// Today's line for payments waiting for this person's word: their count and the way to the screen that holds them. Only
// there while some wait (the count is 0 for anyone who may not check payments).
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";

export function PaymentsToCheckSection({ count }: { count: number }) {
  const t = useTranslations("today.paymentsToCheck");
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-section font-semibold">
          {t("title")}
        </h2>
        <span className="numbers text-label text-muted-foreground">{formatCount(count)}</span>
      </div>
      <Item size="sm" asChild>
        <Link href={routes.payments}>
          <ItemContent>
            <ItemTitle>{t("count", { count })}</ItemTitle>
          </ItemContent>
          <span className="text-label font-semibold">{t("open")}</span>
        </Link>
      </Item>
    </section>
  );
}
