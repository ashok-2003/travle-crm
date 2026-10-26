"use client";

// What a person can do with a message (spec 3.2; sales inbox spec 6): try a failed one again, and from a menu beside any bubble
// star it for the team or copy its words.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useMutation } from "@tanstack/react-query";
import { ChevronDownIcon, CopyIcon, ForwardIcon, InfoIcon, ReplyIcon, StarIcon, StarOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/data/trpc";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { ForwardDialog } from "./forward-dialog";
import { MessageInfo } from "./message-info";
import { useReplying } from "./use-replying";
import { useInvalidate, useStar } from "./use-sales-inbox";

const failureCodes = [
  "window_closed",
  "not_on_whatsapp",
  "bad_number",
  "rate_limited",
  "tier_limit",
  "provider_down",
  "unsure",
  "paused",
  "not_connected",
  "opted_out",
  "file_missing",
] as const;

/** "Not sent", why in a sentence, and Try again, which puts the same message back in the queue. */
export function NotSent({ message }: { message: ChatMessage }) {
  const t = useTranslations("inbox.chat");
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const access = useWriteAccess("change");
  const mayReply = useHolds("inbox:reply");
  const retry = useMutation(
    trpc.inbox.retry.mutationOptions({
      onSuccess: () => Promise.all([invalidate("messages"), invalidate("chats")]),
    }),
  );
  const discard = useMutation(
    trpc.inbox.discard.mutationOptions({
      onSuccess: () => Promise.all([invalidate("messages"), invalidate("chats")]),
    }),
  );
  const code = failureCodes.find((known) => known === message.failureCode);
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-label font-medium text-status-bad-ink">{t(`failure.${code ?? "other"}`)}</p>
      <RefusalAlert error={retry.error ?? discard.error} />
      {mayReply && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!access.allowed || retry.isPending || discard.isPending}
            onClick={() => {
              retry.mutate({ messageId: message.id });
            }}
          >
            {t("retry")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!access.allowed || retry.isPending || discard.isPending}
            onClick={() => {
              discard.mutate({ messageId: message.id });
            }}
          >
            {t("discard")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Beside a bubble on hover (always on a touch screen): star it for the team, forward its words, or copy them. */
export function MessageActions({ message, className }: { message: ChatMessage; className?: string }) {
  const t = useTranslations("inbox.chat");
  const mayReply = useHolds("inbox:reply");
  const star = useStar();
  const [forwarding, setForwarding] = useState(false);
  const [showingInfo, setShowingInfo] = useState(false);
  const { replyTo } = useReplying();
  const trigger = useRef<HTMLButtonElement>(null);
  const words = message.body ?? message.caption;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-6 text-muted-foreground after:absolute after:-inset-2.5", className)}
            aria-label={t("messageActions")}
          >
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={message.direction === "out" ? "end" : "start"}>
          {mayReply && message.status !== "failed" && message.status !== "superseded" && (
            <DropdownMenuItem
              onSelect={() => {
                replyTo(message);
              }}
            >
              <ReplyIcon aria-hidden="true" />
              {t("reply.action")}
            </DropdownMenuItem>
          )}
          {mayReply && (
            <DropdownMenuItem
              disabled={star.isPending}
              onSelect={() => {
                star.mutate({ messageId: message.id, on: !message.starred });
              }}
            >
              {message.starred ? <StarOffIcon aria-hidden="true" /> : <StarIcon aria-hidden="true" />}
              {message.starred ? t("unstar") : t("star")}
            </DropdownMenuItem>
          )}
          {mayReply && words !== null && (
            <DropdownMenuItem
              onSelect={() => {
                setForwarding(true);
              }}
            >
              <ForwardIcon aria-hidden="true" />
              {t("forward.action")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setShowingInfo(true);
            }}
          >
            <InfoIcon aria-hidden="true" />
            {t("infoAction")}
          </DropdownMenuItem>
          {words !== null && (
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(words).then(() => toast.success(t("copied")));
              }}
            >
              <CopyIcon aria-hidden="true" />
              {t("copy")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {showingInfo && (
        <MessageInfo message={message} open={showingInfo} onOpenChange={setShowingInfo} returnFocusTo={trigger} />
      )}
      {words !== null && forwarding && (
        <ForwardDialog
          messageId={message.id}
          words={words}
          open={forwarding}
          onOpenChange={setForwarding}
          returnFocusTo={trigger}
        />
      )}
    </>
  );
}
