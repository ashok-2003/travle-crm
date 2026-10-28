"use client";

// A sticker, bare and large (audit 15). Where it is not here yet, or its picture will not load, a tile of the same size with a
// sticker icon stands in, so the chat never shows a gap with a time floating in it.
import { StickerIcon } from "lucide-react";
import { useState } from "react";

export function StickerTile() {
  return (
    <span className="flex size-36 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <StickerIcon aria-hidden="true" className="size-10" />
    </span>
  );
}

export function StickerImage({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <StickerTile />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="size-36 object-contain"
      onError={() => {
        setBroken(true);
      }}
    />
  );
}
