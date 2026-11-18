"use client";

// The payments waiting for this person's word, as one line inside "AI needs you": their count and the way to the screen
// that holds them. Only there while some wait (the count is 0 for anyone who may not check payments).
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { routes } from "@/lib/routes";

export function PaymentsToCheckLine({ count }: { count: number }) {
  const t = useTranslations("today.paymentsToCheck");
  return (
    <Item size="sm" variant="outline" asChild>
      <Link href={routes.payments}>
        <ItemContent>
          <ItemTitle>{t("count", { count })}</ItemTitle>
        </ItemContent>
        <span className="text-label font-semibold">{t("open")}</span>
      </Link>
    </Item>
  );
}
