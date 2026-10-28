"use client";

// "Replying to Rahul" above the reply box (audit 8): the message being answered, in a line, with a way to drop it. Sending, or
// choosing another chat, ends it.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { useMe } from "@/session/me-context";
import { useOwners } from "./use-owner-names";

const kindWord = {
  image: "image",
  sticker: "sticker",
  video: "video",
  audio: "audio",
  document: "document",
  location: "location",
  contacts: "contacts",
} as const;
type KindWord = (typeof kindWord)[keyof typeof kindWord];
const isKindWord = (kind: string): kind is keyof typeof kindWord => kind in kindWord;

export function ReplyingBar({
  message,
  customerName,
  onCancel,
}: {
  message: ChatMessage;
  customerName: string;
  onCancel: () => void;
}) {
  const t = useTranslations("inbox.chat");
  const { nameOf } = useOwners();
  const me = useMe().user.id;
  const ours = message.direction === "out";
  const name = !ours
    ? customerName
    : message.sentBy === me
      ? t("reply.youName")
      : (nameOf(message.sentBy) ?? t("reply.teammate"));
  const words = message.body ?? message.caption;
  const kind: KindWord | "unsupported" = isKindWord(message.kind) ? kindWord[message.kind] : "unsupported";
  return (
    <Item variant="muted" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle>{t("reply.replyingTo", { name })}</ItemTitle>
        <ItemDescription className="line-clamp-1" dir="auto">
          {words ?? t(`quote.kinds.${kind}`)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button type="button" variant="ghost" size="icon" aria-label={t("reply.cancel")} onClick={onCancel}>
          <XIcon aria-hidden="true" />
        </Button>
      </ItemActions>
    </Item>
  );
}
