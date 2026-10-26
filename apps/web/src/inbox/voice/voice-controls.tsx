"use client";

// The microphone, in the reply box: the button that starts a recording, and, while one runs, its row in the box's place (the
// running time, Cancel, Send). A refusal of the microphone is said in words, with how to allow it.
import { MicIcon, SendIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusDot } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { VoiceProblem } from "./voice-recorder";
import type { VoicePhase } from "./use-voice-note";

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
};

export function MicButton({ disabled, onStart }: { disabled: boolean; onStart: () => void }) {
  const t = useTranslations("inbox.chat.composer");
  return (
    <Button
      type="button"
      size="icon"
      className="shrink-0 rounded-full"
      aria-label={t("record")}
      disabled={disabled}
      onClick={onStart}
    >
      <MicIcon aria-hidden="true" />
    </Button>
  );
}

export function VoiceProblemNote({ problem }: { problem: VoiceProblem | null }) {
  const t = useTranslations("inbox.chat.composer.voice");
  if (problem === null) return null;
  return (
    <p role="alert" className="text-label font-medium text-status-bad-ink">
      {t(problem)}
    </p>
  );
}

/** The recording's row: Cancel, the time running, Send. */
export function RecordingRow({
  phase,
  elapsedMs,
  busy,
  onCancel,
  onSend,
}: {
  phase: VoicePhase;
  elapsedMs: number;
  busy: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const t = useTranslations("inbox.chat.composer");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("cancelRecording")}
          disabled={busy}
          onClick={onCancel}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
        <p className="flex min-h-11 flex-1 items-center gap-2 numbers" role="timer" aria-label={t("recording")}>
          <StatusDot tone="bad" className="motion-safe:animate-pulse" />
          {clock(elapsedMs)}
        </p>
        <Button type="button" disabled={busy} onClick={onSend}>
          <SendIcon aria-hidden="true" />
          {t("send")}
        </Button>
      </div>
      {phase === "limit" && <p className="text-label text-muted-foreground">{t("limit")}</p>}
    </div>
  );
}
