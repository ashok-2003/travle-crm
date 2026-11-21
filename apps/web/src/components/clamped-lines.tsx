"use client";

// Long words cut to three lines (a timeline note, what the AI noted) with More under them, which opens the rest, and
// Less to cut them again. More shows only when the words are cut: the box is measured, and again when its width
// changes. Line breaks the writer typed are kept.
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ClampedLines({ text, className }: { text: string; className?: string }) {
  const t = useTranslations("common");
  const id = useId();
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = box.current;
    if (node === null || open) return;
    const measure = () => {
      setCut(node.scrollHeight > node.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [text, open]);
  return (
    <div className="flex flex-col items-start">
      <p ref={box} id={id} className={cn("whitespace-pre-line script-leading", !open && "line-clamp-3", className)}>
        {text}
      </p>
      {(cut || open) && (
        <Button
          variant="link"
          className="px-0"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? t("readLess") : t("readMore")}
        </Button>
      )}
    </div>
  );
}
