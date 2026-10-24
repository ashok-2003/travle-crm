"use client";

// What sits under the messages for someone who may reply (spec 3.2): the reply box while the 24-hour window is open; a plain
// note instead when it has closed, the customer never wrote, the number is paused or this is the demo; and, while the chat
// waits for an answer, Mark as answered for one given another way. Someone who may only read sees nothing here.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription } from "@/components/ui/item";
import { useTRPC } from "@/data/trpc";
import { formatDayTime } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { Composer } from "./composer";
import { useInboxStatus } from "./use-inbox";

const WINDOW_MS = 24 * 3_600_000;

function Note({ children }: { children: string }) {
  return (
    <Item variant="muted" size="sm">
      <ItemContent>
        <ItemDescription className="line-clamp-none">{children}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function MarkAnswered({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const access = useWriteAccess("change");
  const mark = useMutation(
    trpc.inbox.markAnswered.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() }),
    }),
  );
  return (
    <div className="flex flex-col items-start gap-2">
      <RefusalAlert error={mark.error} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!access.allowed || mark.isPending}
        onClick={() => {
          mark.mutate({ conversationId });
        }}
      >
        {t("markAnswered")}
      </Button>
    </div>
  );
}

export function ReplyArea({ header }: { header: ConversationHeader }) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const mayReply = useHolds("inbox:reply");
  const status = useInboxStatus();
  if (!mayReply || header.state !== "open") return null;

  const box = () => {
    if (status.data?.demo === true) return <Note>{t("replyDemo")}</Note>;
    if (status.data?.connectionStatus === "paused") return <Note>{t("replyPaused")}</Note>;
    if (header.windowOpenUntil !== null) {
      return <Composer conversationId={header.id} windowOpenUntil={header.windowOpenUntil} />;
    }
    if (header.lastInboundAt === null) return <Note>{t("windowNever")}</Note>;
    const closed = new Date(new Date(header.lastInboundAt).getTime() + WINDOW_MS);
    return <Note>{t("windowClosed", { closed: formatDayTime(closed, { timeZone }) })}</Note>;
  };
  return (
    <div className="flex flex-col gap-3">
      {box()}
      {header.needsReply && <MarkAnswered conversationId={header.id} />}
    </div>
  );
}
