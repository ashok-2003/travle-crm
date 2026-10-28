"use client";

// Our file while it goes up to storage (audit 6): a bubble at the foot of the chat with its picture, how far it has got and a
// Sending note, where the sent message will take its place. Not a message yet: the api learns of it only when the upload ends.
import { FileIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { usePendingSend } from "./pending-sends";

export function PendingBubble({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat");
  const sending = usePendingSend(conversationId);
  if (sending === null) return null;
  const percent = Math.round(sending.progress * 100);
  return (
    <li className="mt-2 flex flex-row-reverse px-3 md:px-[6%]" aria-label={t("sendingFile")}>
      <div className="flex max-w-[min(85%,38rem)] flex-col gap-1 rounded-lg bg-chat-bubble-out p-1 text-body">
        {sending.previewUrl === null ? (
          <p className="flex items-center gap-2 p-2">
            <FileIcon aria-hidden="true" className="size-5 shrink-0" />
            <span className="wrap-anywhere">{sending.file.name}</span>
          </p>
        ) : (
          // The member's own picture, from memory: not an optimised Next image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sending.previewUrl}
            alt=""
            className="h-auto max-h-72 w-auto max-w-full rounded-md object-contain opacity-70"
          />
        )}
        {sending.caption !== undefined && (
          <p dir="auto" className="px-1.5 whitespace-pre-wrap">
            {sending.caption}
          </p>
        )}
        <div className="flex items-center gap-2 px-1.5 pb-0.5 text-caption text-muted-foreground">
          <Progress value={percent} aria-label={t("sendingFile")} className="max-w-32" />
          {t("sendingFile")} {percent}%
        </div>
      </div>
    </li>
  );
}
