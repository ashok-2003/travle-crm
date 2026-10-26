"use client";

// Writing a team note in a chat (sales inbox spec 6): a note on the chat's lead, which the customer never sees. "@" opens the
// teammates who can work leads; choosing one writes "@Name", and that person is told once the note is saved, if they may see
// the lead. A follow-up may be set with it (note-follow-up.tsx): the note then says when, and the lead gets the follow-up for
// its owner. Enter saves on a computer, Shift+Enter is a new line.
import { MAX_NOTE_LENGTH } from "@travel-crm/contracts/inbox";
import type { WallClockTime } from "@travel-crm/contracts/kernel";
import { useMutation } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { ChatAvatar } from "./chat-avatar";
import { ComposerPicker } from "./composer-picker";
import { followUpWords, NoteFollowUp } from "./note-follow-up";
import { useOwners } from "./use-owner-names";
import { useAddNote } from "./use-sales-inbox";

/** The name being typed after the last "@", when the caret is right after it; else null. */
const typedMention = (text: string): string | null => {
  const match = /(?:^|\s)@([\p{L}\p{N}]*)$/u.exec(text);
  return match === null ? null : (match[1] ?? "").toLowerCase();
};

export function TeamNoteComposer({ conversationId, leadId }: { conversationId: string; leadId: string }) {
  const t = useTranslations("inbox.chat");
  const trpc = useTRPC();
  const refreshWork = useRefreshWork();
  const { apiError } = useErrorMessage();
  const [followUp, setFollowUp] = useState<WallClockTime | null>(null);
  const addWork = useMutation(
    trpc.leads.addWork.mutationOptions({
      onSuccess: async () => {
        await refreshWork();
      },
      onError: (error) => toast.error(apiError(error)),
    }),
  );
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
    const due = followUp;
    // The note says when the follow-up is, so the chat shows it among the messages.
    const body = due === null ? words : `${words}\n\n${t("followUp.inNote", { when: followUpWords(due) })}`;
    add.mutate(
      { conversationId, body: body.slice(0, MAX_NOTE_LENGTH), mentions: named },
      {
        onSuccess: () => {
          setText("");
          setMentions([]);
          setFollowUp(null);
          if (due !== null) {
            const title = words.split("\n")[0]?.slice(0, 200) ?? t("followUp.title");
            addWork.mutate({ leadId, kind: "follow-up", title, due });
          }
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
      <div className="flex flex-col gap-1.5">
        <div className="relative min-w-0">
          {choices.length > 0 && (
            <ComposerPicker
              choices={choices.map((owner) => ({ ...owner, id: owner.userId }))}
              active={Math.min(active, choices.length - 1)}
              listId={listId}
              label={t("mentionPeople")}
              onPick={pick}
              row={(owner) => (
                <>
                  <ChatAvatar name={owner.name} seed={owner.userId} />
                  <span>{owner.name}</span>
                </>
              )}
            />
          )}
          <InputGroup className="rounded-xl bg-status-attention-fill">
            <InputGroupTextarea
              ref={box}
              dir="auto"
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              className="max-h-48 min-h-16 py-3"
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
        <div className="flex flex-wrap items-center gap-2">
          <NoteFollowUp value={followUp} onChange={setFollowUp} disabled={add.isPending || !access.allowed} />
          <p className="text-caption text-muted-foreground">{t("noteHint")}</p>
          <Button
            type="submit"
            className="ml-auto shrink-0 rounded-full px-5"
            disabled={words === "" || add.isPending || !access.allowed}
          >
            {add.isPending ? <Spinner aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
            {t("saveNote")}
          </Button>
        </div>
      </div>
    </form>
  );
}
