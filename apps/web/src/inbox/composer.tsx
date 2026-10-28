"use client";

// The reply box (spec 3.2; sales inbox spec, design v2): a text box of a few lines, and under it the tools (a template,
// emoji, Attach a file or photo sent straight to storage, quick replies, Payment details, Send later, a voice note) and
// Send, which is off while the box is empty or the subscription refuses a change (with the reason under it). Enter sends on a computer and starts a new
// line on a touch screen; Shift+Enter always does. A file waits in the box with a name and a way to take it off, and the words
// become its caption (the chat's bar says how long free text may still be sent). Typing "/" opens the agency's quick replies, and
// Payment details (₹) puts the agency's payment words in the box (the quick reply with the shortcut "payment").
import {
  MAX_WHATSAPP_SEND_BYTES,
  whatsappSendContentTypes,
  type ConversationHeader,
} from "@travel-crm/contracts/inbox";
import { PaperclipIcon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { formatPhoneNumber } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { AiDraftNote, SuggestReplyButton, type AiDraft } from "@/ai/suggest-reply-button";
import { useSuggestReplyAvailable } from "@/ai/use-ai";
import { AttachedFile } from "./attached-file";
import { useDroppedFile } from "./chat-drop";
import { usePendingSend } from "./pending-sends";
import { draftKey } from "./forward-dialog";
import { EmojiButton } from "./emoji-button";
import { ToolsRow, ToolsSheet } from "./composer-tools";
import { QuickReplyList } from "./quick-reply-list";
import { ReplyingBar } from "./replying-bar";
import { useQuickReplyPicker } from "./use-quick-reply-picker";
import { useReplying } from "./use-replying";
import { useTypingSignal } from "./use-sales-inbox";
import { useReply } from "./use-reply";
import { useVoiceNote } from "./voice/use-voice-note";
import { MicButton, RecordingRow, VoiceProblemNote } from "./voice/voice-controls";

const MAX_TEXT = 4096;
const acceptedTypes = whatsappSendContentTypes.join(",");

export function Composer({ header, windowOpenUntil }: { header: ConversationHeader; windowOpenUntil: string }) {
  const t = useTranslations("inbox.chat");
  const conversationId = header.id;
  const listId = useId();
  const access = useWriteAccess("change");
  const hintId = useId();
  // The words typed here are kept in the tab for this chat, so they are there again when the person comes back to it; so are
  // words forwarded from another chat, which wait under the same key. A send clears them; sign-out wipes the tab's values.
  const [text, setTextState] = useState(() => readTabValue(draftKey(header.id)) ?? "");
  const setText = (next: string) => {
    setTextState(next);
    keepTabValue(draftKey(header.id), next);
  };
  // The AI's draft the box began as (Suggest reply): kept for the audit when the reply is sent, whatever the person changes.
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const canSuggest = useSuggestReplyAvailable();
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<"fileType" | "fileSize" | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const wide = useWideScreen();
  const signalTyping = useTypingSignal(conversationId);
  const replying = useReplying();
  const reply = useReply(conversationId, () => {
    setText("");
    setAiDraft(null);
    setFile(null);
    replying.clear();
  });
  const voice = useVoiceNote((recorded) => {
    reply.sendFile(recorded, undefined);
  });
  const sending = usePendingSend(conversationId);
  const quick = useQuickReplyPicker(header, text, setText, box);
  const words = text.trim();
  // Still the AI's own words: shown as drafted by AI until the person changes a letter.
  const stillAiWords = aiDraft !== null && words === aiDraft.text.trim();
  const recording = voice.phase === "recording" || voice.phase === "limit";
  const insertEmoji = (emoji: string) => {
    const field = box.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? start;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  const toolProps = {
    conversationId,
    disabled: reply.pending || !access.allowed,
    words,
    hasFile: file !== null,
    windowOpenUntil,
    onQuickReplies: () => {
      setText("/");
      quick.typedSomething();
      requestAnimationFrame(() => box.current?.focus());
    },
    onPayment: quick.payment,
    onScheduled: () => {
      setText("");
    },
  };
  const canSend = access.allowed && !reply.pending && (file !== null || words !== "");

  const submit = () => {
    if (!canSend) return;
    const quoted = replying.message?.id;
    if (file === null) reply.sendText(words, quoted, aiDraft?.id);
    else reply.sendFile(file, words === "" ? undefined : words, quoted);
  };
  const choose = (chosen: File | undefined) => {
    if (chosen === undefined) return;
    const problem = !(whatsappSendContentTypes as readonly string[]).includes(chosen.type)
      ? "fileType"
      : chosen.size > MAX_WHATSAPP_SEND_BYTES
        ? "fileSize"
        : null;
    setFileProblem(problem);
    setFile(problem === null ? chosen : null);
  };
  // A file dropped on the chat, or pasted into the box, waits in it like a chosen one.
  useDroppedFile(choose);
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.files[0];
    if (pasted === undefined) return;
    event.preventDefault();
    choose(pasted);
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (quick.onKey(event)) return;
    // A touch screen's Enter is a new line: its keyboard has a Send button.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (event.key === "Enter" && !event.shiftKey && !touch && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <RefusalAlert error={reply.error} />
      {replying.message !== null && (
        <ReplyingBar
          message={replying.message}
          customerName={header.name ?? formatPhoneNumber(header.phone)}
          onCancel={replying.clear}
        />
      )}
      {canSuggest && !recording && (
        <SuggestReplyButton
          conversationId={conversationId}
          disabled={reply.pending || !access.allowed || file !== null}
          onDraft={(draft) => {
            setAiDraft(draft);
            setText(draft.text);
            requestAnimationFrame(() => box.current?.focus());
          }}
        />
      )}
      {stillAiWords && <AiDraftNote />}
      {fileProblem !== null && <p className="text-label text-destructive">{t(`composer.${fileProblem}`)}</p>}
      {file !== null && (
        <AttachedFile
          file={file}
          busy={reply.pending}
          progress={reply.uploading ? (sending?.progress ?? 0) : null}
          onCancel={reply.cancel}
          onRemove={() => {
            setFile(null);
          }}
        />
      )}
      <VoiceProblemNote problem={voice.problem} />
      {recording ? (
        <RecordingRow
          phase={voice.phase}
          elapsedMs={voice.elapsedMs}
          busy={reply.pending}
          onCancel={voice.cancel}
          onSend={() => void voice.finish()}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            ref={picker}
            type="file"
            accept={acceptedTypes}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {/* One line that grows as you type, the emoji and the clip inside it, and one round button at its right: the
              microphone while the box is empty, Send once there is something to send, as WhatsApp's. */}
          <div className="flex items-end gap-1.5">
            {!wide && <ToolsSheet {...toolProps} />}
            <div className="relative min-w-0 flex-1">
              {quick.shown !== null && (
                <QuickReplyList
                  replies={quick.shown}
                  active={Math.min(quick.active, Math.max(quick.shown.length - 1, 0))}
                  listId={listId}
                  onPick={(chosen) => {
                    quick.place(chosen, true);
                  }}
                />
              )}
              <InputGroup className="min-h-11 rounded-3xl bg-background">
                {wide && (
                  <InputGroupAddon align="inline-start">
                    <EmojiButton onPick={insertEmoji} disabled={reply.pending || !access.allowed} />
                  </InputGroupAddon>
                )}
                <InputGroupTextarea
                  ref={box}
                  dir="auto"
                  rows={1}
                  maxLength={MAX_TEXT}
                  className="max-h-40 min-h-11 py-3"
                  aria-label={t("composer.label")}
                  aria-describedby={access.hint === null ? undefined : hintId}
                  placeholder={t("composer.placeholder")}
                  value={text}
                  disabled={!access.allowed}
                  onChange={(event) => {
                    setText(event.target.value);
                    // Cleared altogether: whatever is written next is the person's own.
                    if (event.target.value.trim() === "") setAiDraft(null);
                    signalTyping();
                    quick.typedSomething();
                  }}
                  onKeyDown={onKey}
                  onPaste={onPaste}
                  role="combobox"
                  aria-expanded={quick.shown !== null}
                  aria-controls={quick.shown === null ? undefined : listId}
                  aria-autocomplete="list"
                />
                <InputGroupAddon align="inline-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    aria-label={t("composer.attach")}
                    disabled={reply.pending || !access.allowed}
                    onClick={() => picker.current?.click()}
                  >
                    <PaperclipIcon aria-hidden="true" />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </div>
            {voice.available && words === "" && file === null && !reply.pending ? (
              <MicButton disabled={!access.allowed || voice.phase === "starting"} onStart={() => void voice.start()} />
            ) : (
              <Button
                type="submit"
                size="icon"
                className="shrink-0 rounded-full"
                disabled={!canSend}
                aria-label={reply.pending ? t("composer.sending") : t("composer.send")}
                aria-describedby={access.hint === null ? undefined : hintId}
              >
                {reply.pending ? <Spinner aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
              </Button>
            )}
          </div>
          {wide && <ToolsRow {...toolProps} />}
        </div>
      )}
      <WriteHint id={hintId} hint={access.hint} visible />
    </form>
  );
}
