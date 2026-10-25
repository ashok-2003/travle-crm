"use client";

// Writing a team note in a chat (sales inbox spec 6): the box in the attention tint so nobody mistakes it for a reply,
// and "@" opens the teammates who can work leads; choosing one writes "@Name" and that person is told once the note is
// saved. Enter saves on a computer, Shift+Enter is a new line. The note is never sent to the customer.
import { MAX_NOTE_LENGTH } from "@travel-crm/contracts/inbox";
import { SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useWriteAccess } from "@/subscription/write-access";
import { ChatAvatar } from "./chat-avatar";
import { useOwners } from "./use-owner-names";
import { useAddNote } from "./use-sales-inbox";

/** The name being typed after the last "@", when the caret is right after it; else null. */
const typedMention = (text: string): string | null => {
  const match = /(?:^|\s)@([\p{L}\p{N}]*)$/u.exec(text);
  return match === null ? null : (match[1] ?? "").toLowerCase();
};

export function TeamNoteComposer({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat");
  const access = useWriteAccess("change");
  const listId = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const { owners } = useOwners();
  const add = useAddNote();
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<{ userId: string; name: string }[]>([]);
  const [active, setActive] = useState(0);
  const typed = typedMention(text);
  const choices = typed === null ? [] : owners.filter((owner) => owner.name.toLowerCase().includes(typed)).slice(0, 6);
  const words = text.trim();

  const pick = (owner: { userId: string; name: string }) => {
    const next = text.replace(/@([\p{L}\p{N}]*)$/u, `@${owner.name} `);
    setText(next);
    setMentions((held) => (held.some((one) => one.userId === owner.userId) ? held : [...held, owner]));
    setActive(0);
    requestAnimationFrame(() => box.current?.focus());
  };
  const save = () => {
    if (words === "" || add.isPending || !access.allowed) return;
    // Only the people still named in the words are told.
    const named = mentions.filter((one) => text.includes(`@${one.name}`)).map((one) => one.userId);
    add.mutate(
      { conversationId, body: words, mentions: named },
      {
        onSuccess: () => {
          setText("");
          setMentions([]);
        },
      },
    );
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (choices.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (index + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
        return;
      }
      const chosen = choices[Math.min(active, choices.length - 1)];
      if ((event.key === "Enter" || event.key === "Tab") && chosen !== undefined) {
        event.preventDefault();
        pick(chosen);
        return;
      }
    }
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (event.key === "Enter" && !event.shiftKey && !touch && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <RefusalAlert error={add.error} />
      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          {choices.length > 0 && (
            <Card size="sm" className="absolute inset-x-0 bottom-full mb-2 py-1">
              <ItemGroup id={listId} role="listbox" aria-label={t("mentionPeople")} className="gap-0">
                {choices.map((owner, index) => (
                  <Item
                    key={owner.userId}
                    asChild
                    size="sm"
                    className={cn("rounded-none px-3", index === Math.min(active, choices.length - 1) && "bg-muted")}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        pick(owner);
                      }}
                    >
                      <ChatAvatar name={owner.name} />
                      <ItemContent>
                        <ItemTitle>{owner.name}</ItemTitle>
                      </ItemContent>
                    </button>
                  </Item>
                ))}
              </ItemGroup>
            </Card>
          )}
          <InputGroup className="min-h-11 rounded-3xl bg-status-attention-fill">
            <InputGroupTextarea
              ref={box}
              dir="auto"
              rows={1}
              maxLength={MAX_NOTE_LENGTH}
              className="max-h-40 min-h-11 py-3"
              aria-label={t("noteLabel")}
              placeholder={t("notePlaceholder")}
              value={text}
              disabled={!access.allowed || add.isPending}
              role="combobox"
              aria-expanded={choices.length > 0}
              aria-controls={choices.length > 0 ? listId : undefined}
              aria-autocomplete="list"
              onChange={(event) => {
                setText(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
            />
          </InputGroup>
        </div>
        <Button
          type="submit"
          size="icon"
          className="shrink-0 rounded-full"
          disabled={words === "" || add.isPending || !access.allowed}
          aria-label={t("saveNote")}
        >
          {add.isPending ? <Spinner aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
        </Button>
      </div>
      <p className="px-2 text-caption text-muted-foreground">{t("noteHint")}</p>
    </form>
  );
}
