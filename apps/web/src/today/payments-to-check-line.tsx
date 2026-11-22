"use client";

// The payments waiting for this person's word, inside "AI needs you": an amber card (the attention colour, as Home's
// "Needs your attention") with their count, what to do, and a Check payments button to the screen that holds them, so
// it is seen and pressed (owner, 2026-11-22: a plain line was missed). Only there while some wait (the count is 0 for
// anyone who may not check payments).
import { BanknoteIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { cardTints } from "@/components/card-tints";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { routes } from "@/lib/routes";

export function PaymentsToCheckLine({ count }: { count: number }) {
  const t = useTranslations("today.paymentsToCheck");
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} size="sm" className={cardTints.attention}>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <BanknoteIcon aria-hidden="true" className="size-6 shrink-0 text-status-attention-ink" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p id={titleId} className="font-semibold text-status-attention-ink">
            {t("count", { count })}
          </p>
          <p className="text-label text-muted-foreground">{t("how")}</p>
        </div>
        <Button asChild className="self-start sm:self-center">
          <Link href={routes.payments}>
            {t("open")}
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
