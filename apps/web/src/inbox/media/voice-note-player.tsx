"use client";

// A voice note's player (audit 12): play and pause, a bar that shows how far it has got and takes a tap to move there, the time,
// and a speed of 1x, 1.5x or 2x. The browser's own audio element does the playing; it is not shown.
import { PauseIcon, PlayIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const SPEEDS = [1, 1.5, 2] as const;

/** 0:07, 1:05. */
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
};

export function VoiceNotePlayer({ url }: { url: string }) {
  const t = useTranslations("inbox.chat.voice");
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const known = Number.isFinite(length) && length > 0;
  return (
    <div className="flex min-w-56 items-center gap-2">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setLength(event.currentTarget.duration);
        }}
        onDurationChange={(event) => {
          setLength(event.currentTarget.duration);
        }}
        onTimeUpdate={(event) => {
          setAt(event.currentTarget.currentTime);
        }}
        onPlay={() => {
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setAt(0);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={playing ? t("pause") : t("play")}
        onClick={() => {
          const element = audio.current;
          if (element === null) return;
          if (playing) element.pause();
          else void element.play();
        }}
      >
        {playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          className="py-2"
          aria-label={t("seek")}
          disabled={!known}
          onClick={(event) => {
            const element = audio.current;
            if (element === null || !known) return;
            const box = event.currentTarget.getBoundingClientRect();
            element.currentTime = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * length;
          }}
        >
          <Progress value={known ? (at / length) * 100 : 0} aria-label={t("progress")} />
        </button>
        <span className="numbers text-caption text-muted-foreground">
          {clock(at)}
          {known && ` / ${clock(length)}`}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="numbers"
        aria-label={t("speed", { speed })}
        onClick={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
          setSpeed(next);
          if (audio.current !== null) audio.current.playbackRate = next;
        }}
      >
        {speed}x
      </Button>
    </div>
  );
}
