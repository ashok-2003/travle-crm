"use client";

// The reply box (spec 3.2): a growing text box, Attach (a file or photo, sent straight to storage), and Send, which is off while
// the box is empty or the subscription refuses a change (with the reason under it). Enter sends on a computer and starts a new
// line on a touch screen; Shift+Enter always does. A file waits in the box with a name and a way to take it off, and the words
// become its caption. Under the box, how long free text may still be sent.
import { MAX_WHATSAPP_SEND_BYTES, whatsappSendContentTypes } from "@travel-crm/contracts/inbox";
import { PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { formatDayTime } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import { EmojiButton } from "./emoji-button";
import { useReply } from "./use-reply";
import { useVoiceNote } from "./voice/use-voice-note";
import { MicButton, RecordingRow, VoiceProblemNote } from "./voice/voice-controls";

const MAX_TEXT = 4096;
const acceptedTypes = whatsappSendContentTypes.join(",");

export function Composer({ conversationId, windowOpenUntil }: { conversationId: string; windowOpenUntil: string }) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const access = useWriteAccess("change");
  const hintId = useId();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<"fileType" | "fileSize" | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const wide = useWideScreen();
  const reply = useReply(conversationId, () => {
    setText("");
    setFile(null);
  });
  const voice = useVoiceNote((recorded) => {
    reply.sendFile(recorded, undefined);
  });
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
        <Item variant="muted" size="sm">
          <ItemContent>
            <ItemTitle className="wrap-anywhere">{file.name}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("composer.removeFile")}
              disabled={reply.pending}
              onClick={() => {
                setFile(null);
              }}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </ItemActions>
        </Item>
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
        <div className="flex items-end gap-2">
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
          {/* One rounded bar, as WhatsApp's: emoji and attach, then the words, which grow to six lines. */}
          <InputGroup className="min-h-11 rounded-3xl bg-background">
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
              }}
              onKeyDown={onKey}
            />
            <InputGroupAddon className="self-end pb-0.5">
              {wide && <EmojiButton onPick={insertEmoji} disabled={reply.pending || !access.allowed} />}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("composer.attach")}
                disabled={reply.pending || !access.allowed}
                onClick={() => picker.current?.click()}
              >
                <PaperclipIcon aria-hidden="true" />
              </Button>
            </InputGroupAddon>
          </InputGroup>
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
      )}
      <WriteHint id={hintId} hint={access.hint} visible />
      <p className="px-2 text-caption text-muted-foreground">
        {t("windowOpen", { until: formatDayTime(new Date(windowOpenUntil), { timeZone }) })}
      </p>
    </form>
  );
}
