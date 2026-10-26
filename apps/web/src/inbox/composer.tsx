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
import { IndianRupeeIcon, PaperclipIcon, SendIcon, ZapIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import { useWideScreen } from "@/lib/use-wide-screen";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { AttachedFile } from "./attached-file";
import { draftKey } from "./forward-dialog";
import { EmojiButton } from "./emoji-button";
import { QuickReplyList } from "./quick-reply-list";
import { ScheduleButton } from "./schedule-button";
import { TemplateTool } from "./template-tool";
import { SendDetailsTool } from "./trip-kits/send-details-tool";
import { useQuickReplyPicker } from "./use-quick-reply-picker";
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
  // Words forwarded from another chat wait in the tab for this box; it takes them once.
  const [text, setText] = useState(() => {
    const forwarded = readTabValue(draftKey(header.id)) ?? "";
    if (forwarded !== "") keepTabValue(draftKey(header.id), "");
    return forwarded;
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<"fileType" | "fileSize" | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const wide = useWideScreen();
  const signalTyping = useTypingSignal(conversationId);
  const reply = useReply(conversationId, () => {
    setText("");
    setFile(null);
  });
  const voice = useVoiceNote((recorded) => {
    reply.sendFile(recorded, undefined);
  });
  const quick = useQuickReplyPicker(header, text, setText, box);
  const words = text.trim();
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
  const canSend = access.allowed && !reply.pending && (file !== null || words !== "");

  const submit = () => {
    if (!canSend) return;
    if (file === null) reply.sendText(words);
    else reply.sendFile(file, words === "" ? undefined : words);
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
      {fileProblem !== null && <p className="text-label text-destructive">{t(`composer.${fileProblem}`)}</p>}
      {file !== null && (
        <AttachedFile
          file={file}
          busy={reply.pending}
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
          {/* The words on top, room for several lines, as the sales inboxes have it; the tools and Send under them. */}
          <div className="relative min-w-0">
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
            <InputGroup className="rounded-xl bg-background">
              <InputGroupTextarea
                ref={box}
                dir="auto"
                rows={2}
                maxLength={MAX_TEXT}
                className="max-h-48 min-h-16 py-3"
                aria-label={t("composer.label")}
                aria-describedby={access.hint === null ? undefined : hintId}
                placeholder={t("composer.placeholder")}
                value={text}
                disabled={!access.allowed}
                onChange={(event) => {
                  setText(event.target.value);
                  signalTyping();
                  quick.typedSomething();
                }}
                onKeyDown={onKey}
                role="combobox"
                aria-expanded={quick.shown !== null}
                aria-controls={quick.shown === null ? undefined : listId}
                aria-autocomplete="list"
              />
            </InputGroup>
          </div>
          <div className="flex items-center gap-0.5" role="toolbar" aria-label={t("composer.tools")}>
            <TemplateTool conversationId={conversationId} disabled={reply.pending || !access.allowed} />
            <SendDetailsTool conversationId={conversationId} disabled={reply.pending || !access.allowed} />
            {wide && <EmojiButton onPick={insertEmoji} disabled={reply.pending || !access.allowed} />}
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label={t("composer.quickReplies")}
              disabled={reply.pending || !access.allowed}
              onClick={() => {
                setText("/");
                quick.typedSomething();
                requestAnimationFrame(() => box.current?.focus());
              }}
            >
              <ZapIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label={t("composer.paymentDetails")}
              disabled={reply.pending || !access.allowed}
              onClick={quick.payment}
            >
              <IndianRupeeIcon aria-hidden="true" />
            </Button>
            {words !== "" && file === null && (
              <ScheduleButton
                conversationId={conversationId}
                windowOpenUntil={windowOpenUntil}
                text={words}
                disabled={!access.allowed || reply.pending}
                onScheduled={() => {
                  setText("");
                }}
              />
            )}
            {voice.available && words === "" && file === null && !reply.pending && (
              <MicButton disabled={!access.allowed || voice.phase === "starting"} onStart={() => void voice.start()} />
            )}
            <Button
              type="submit"
              className="ml-auto shrink-0 rounded-full px-5"
              disabled={!canSend}
              aria-describedby={access.hint === null ? undefined : hintId}
            >
              {reply.pending ? <Spinner aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
              {reply.pending ? t("composer.sending") : t("composer.send")}
            </Button>
          </div>
        </div>
      )}
      <WriteHint id={hintId} hint={access.hint} visible />
    </form>
  );
}
