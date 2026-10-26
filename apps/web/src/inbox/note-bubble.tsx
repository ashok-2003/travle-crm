"use client";

// A team note among the messages (sales inbox spec 6): a note on the chat's lead, set apart in the attention tint, across the
// middle, with "Note · Priya" and its time. It was never sent: the customer does not see it.
import type { ConversationNote } from "@travel-crm/contracts/inbox";
import { StickyNoteIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatTime } from "@/lib/format";
import { useMe } from "@/session/me-context";

export function NoteBubble({ note, people }: { note: ConversationNote; people: Record<string, string> }) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const writer = note.createdBy === null ? null : (people[note.createdBy] ?? null);
  return (
    <li className="my-2 flex justify-center px-3 md:px-[10%]">
      <div className="flex w-full max-w-[38rem] flex-col gap-1 rounded-lg bg-status-attention-fill px-3 py-2 text-status-attention-ink">
        <p className="flex items-center gap-1.5 text-caption font-semibold">
          <StickyNoteIcon aria-hidden="true" className="size-3.5" />
          {t("noteBy", { name: writer ?? t("formerMember") })}
          <span className="ml-auto font-normal">{formatTime(new Date(note.createdAt), { timeZone })}</span>
        </p>
        <p className="break-words whitespace-pre-wrap script-leading" dir="auto">
          {note.body}
        </p>
      </div>
    </li>
  );
}
