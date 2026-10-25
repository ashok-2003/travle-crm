"use client";

// Quick replies in the reply bar (sales inbox spec, section 5): typing "/" at the start opens the agency's saved answers
// above the bar, narrowed as the shortcut is typed; the arrows move, Enter or a tap puts the answer in the box with its
// blanks filled from the chat ({name}, {destination}, {month}, {agent}), and Esc closes it. The box keeps the focus.
import type { ConversationHeader, QuickReply } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";

/** The shortcut being typed: the box's words when they are "/" and letters only, else null (the list stays shut). */
export const typedShortcut = (text: string): string | null => {
  const match = /^\/([a-z0-9-]*)$/i.exec(text);
  return match === null ? null : (match[1] ?? "").toLowerCase();
};

/** The replies that match what is typed after "/": by shortcut first, then by title. */
export function matchingReplies(replies: QuickReply[], typed: string): QuickReply[] {
  const byShortcut = replies.filter((reply) => reply.shortcut.startsWith(typed));
  const byTitle = replies.filter(
    (reply) => !reply.shortcut.startsWith(typed) && reply.title.toLowerCase().includes(typed),
  );
  return [...byShortcut, ...byTitle].slice(0, 8);
}

/** A reply's words with the chat's facts in its blanks; a blank with nothing to fill is left empty. */
export function fillBlanks(
  body: string,
  facts: { header: ConversationHeader; agent: string; monthOf: (date: string) => string },
): string {
  const first = (name: string | null) => name?.split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    name: first(facts.header.name),
    destination: facts.header.trip.destination ?? "",
    month: facts.header.trip.travelMonth === null ? "" : facts.monthOf(facts.header.trip.travelMonth),
    agent: first(facts.agent),
  };
  return body.replace(/\{(name|destination|month|agent)\}/g, (_, key: string) => values[key] ?? "");
}

export function QuickReplyList({
  replies,
  active,
  onPick,
  listId,
}: {
  replies: QuickReply[];
  active: number;
  onPick: (reply: QuickReply) => void;
  listId: string;
}) {
  const t = useTranslations("inbox.chat.composer");
  return (
    <Card size="sm" className="absolute inset-x-0 bottom-full mb-2 py-1">
      {replies.length === 0 ? (
        <p className="px-3 py-2 text-muted-foreground">{t("noQuickReplies")}</p>
      ) : (
        <ItemGroup id={listId} role="listbox" aria-label={t("quickReplies")} className="gap-0">
          {replies.map((reply, index) => (
            <Item key={reply.id} asChild size="sm" className={cn("rounded-none px-3", index === active && "bg-muted")}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                id={`${listId}-${reply.id}`}
                // Keep the focus in the box: the tap still picks.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onPick(reply);
                }}
              >
                <ItemContent className="min-w-0 text-left">
                  <ItemTitle>
                    <span className="numbers text-primary">/{reply.shortcut}</span>
                    <span className="truncate">{reply.title}</span>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-1">{reply.body}</ItemDescription>
                </ItemContent>
              </button>
            </Item>
          ))}
        </ItemGroup>
      )}
    </Card>
  );
}
