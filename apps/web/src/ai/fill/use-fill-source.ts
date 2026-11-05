"use client";

// What a person gives the AI to read in a fill sheet: words typed or pasted, a recording from the mic, or a picture. `build()`
// turns it into the fill's source, putting a recording or picture straight in storage first (never through the api); a
// traveller's recording or photo goes up as a sensitive file. Nothing is said: the source is "none" (Draft the days alone).
import type { FillSource } from "@travel-crm/contracts/ai";
import { useState } from "react";
import { readWhatsAppExport } from "../whatsapp-export";
import { useUploadAiInput } from "./use-ai-fill";
import { useRecorder } from "./use-recorder";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface Media {
  blob: Blob;
  type: "audio/wav" | ImageType;
}

/** A pasted WhatsApp chat as "Name: words" lines, without its timestamps; anything else as it was. */
export function withoutTimestamps(text: string): string {
  const messages = readWhatsAppExport(text);
  return messages.length < 2 ? text : messages.map((message) => `${message.sender}: ${message.text}`).join("\n");
}

export function useFillSource(options: { sensitive?: boolean } = {}) {
  const upload = useUploadAiInput();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [uploading, setUploading] = useState(false);
  const recorder = useRecorder((wav) => {
    setMedia({ blob: wav, type: "audio/wav" });
  });
  const words = withoutTimestamps(text);
  return {
    text,
    setText,
    media,
    setMedia,
    recorder,
    uploading,
    /** Something to read: words or a file. */
    ready: text.trim() !== "" || media !== null,
    busy: uploading || recorder.working,
    reset() {
      if (recorder.recording) recorder.stop();
      setText("");
      setMedia(null);
      setUploading(false);
    },
    /** The fill's source; a file is uploaded first. Throws what the upload throws (the sheet shows it). */
    async build(): Promise<Extract<FillSource, { kind: "text" | "upload" | "none" }>> {
      if (media !== null) {
        setUploading(true);
        try {
          const attachmentId = await upload(media.blob, media.type, options.sensitive === true);
          return { kind: "upload", attachmentId, ...(words === "" ? {} : { text: words }) };
        } finally {
          setUploading(false);
        }
      }
      return words === "" ? { kind: "none" } : { kind: "text", text: words };
    },
  };
}

export type FillSourceState = ReturnType<typeof useFillSource>;
