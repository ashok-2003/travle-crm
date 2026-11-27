"use client";

// The proof of payment the customer sent in the chat the AI took this booking from (the owner, 2026-10-30): each screenshot as
// a small picture tile and each PDF as a file tile, loaded when it comes near the screen from the inbox's own signed link
// (under the inbox's rules for who may see it), and opened in a tab of its own. Nothing until there is one.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, ImageOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { openInNewTab } from "@/lib/open-in-new-tab";
import { useNearScreen } from "@/lib/use-near-screen";
import { SectionCard } from "./section-card";

function ProofTile({ messageId, number }: { messageId: string; number: number }) {
  const t = useTranslations("bookings.proof");
  const trpc = useTRPC();
  const client = useTRPCClient();
  const { apiError } = useErrorMessage();
  const [near, ref] = useNearScreen();
  const link = useQuery({ ...trpc.inbox.mediaUrl.queryOptions({ messageId }), enabled: near, staleTime: 4 * 60_000 });
  const isPicture = link.data?.contentType.startsWith("image/") === true;
  return (
    <Button
      ref={ref}
      variant="outline"
      className="size-24 shrink-0 overflow-hidden p-0"
      aria-label={t("open", { number })}
      onClick={() => {
        // A fresh link at the tap: the tile's own may have lapsed (they last five minutes).
        openInNewTab(() => client.inbox.mediaUrl.query({ messageId })).catch((error: unknown) => {
          toast.error(apiError(error));
        });
      }}
    >
      {link.data === undefined ? (
        link.isError ? (
          <ImageOffIcon aria-label={t("loadFailed")} />
        ) : (
          <Skeleton className="size-full rounded-none" />
        )
      ) : isPicture ? (
        // The link is a short-lived signed one, so the browser's own lazy loading is all the tile needs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={link.data.url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <FileTextIcon aria-hidden="true" />
      )}
    </Button>
  );
}

export function ProofCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.proof");
  if (booking.proofMessageIds.length === 0) return null;
  return (
    <SectionCard title={t("title")} anchor="proof">
      <p className="text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap gap-2">
        {booking.proofMessageIds.map((messageId, index) => (
          <ProofTile key={messageId} messageId={messageId} number={index + 1} />
        ))}
      </div>
    </SectionCard>
  );
}
