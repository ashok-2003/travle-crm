"use client";

// The proof of payment the customer sent in the chat the AI took this booking from (the owner, 2026-10-30): each screenshot
// or PDF opens from here, under the inbox's own rules for who may see it. Nothing until there is one.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTRPCClient } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { openInNewTab } from "@/lib/open-in-new-tab";
import { SectionCard } from "./section-card";

export function ProofCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.proof");
  const client = useTRPCClient();
  const { apiError } = useErrorMessage();
  if (booking.proofMessageIds.length === 0) return null;
  return (
    <SectionCard title={t("title")}>
      <p className="text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap gap-2">
        {booking.proofMessageIds.map((messageId, index) => (
          <Button
            key={messageId}
            variant="outline"
            onClick={() => {
              openInNewTab(() => client.inbox.mediaUrl.query({ messageId })).catch((error: unknown) => {
                toast.error(apiError(error));
              });
            }}
          >
            <ImageIcon aria-hidden="true" />
            {t("open", { number: index + 1 })}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}
