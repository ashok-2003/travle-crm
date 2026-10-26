"use client";

// Templates in the reply box's tools (sales inbox spec, design v2): an approved template may be sent at any time, inside
// the 24-hour window as well as after it, so the button is always there beside the other tools.
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SendTemplateDialog } from "./send-template-dialog";

export function TemplateTool({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const t = useTranslations("inbox.chat.composer");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={button}
        type="button"
        variant="ghost"
        className="shrink-0 gap-1.5 px-2.5 text-muted-foreground"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
        }}
      >
        <FileTextIcon aria-hidden="true" />
        {t("templates")}
      </Button>
      <SendTemplateDialog conversationId={conversationId} open={open} onOpenChange={setOpen} returnFocusTo={button} />
    </>
  );
}
