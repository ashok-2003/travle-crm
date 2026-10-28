"use client";

// A video's picture where we have none to show (audit 2, 13): a dark tile with a light play button and, once the browser has read
// the file's head, its length. The frame itself is drawn over it when the browser can show one.
import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** 0:07, 1:05. */
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function VideoThumb({ url, label, className }: { url: string; label: string; className?: string }) {
  const [length, setLength] = useState<number | null>(null);
  return (
    <span className={cn("relative block overflow-hidden rounded-md bg-foreground", className)}>
      <video
        src={url}
        preload="metadata"
        muted
        playsInline
        aria-label={label}
        className="size-full object-contain"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          setLength(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <PlayIcon aria-hidden="true" className="size-12 rounded-full bg-background/20 p-3 text-background" />
      </span>
      {length !== null && (
        <span className="numbers absolute bottom-1 left-2 text-caption text-background">{clock(length)}</span>
      )}
    </span>
  );
}
