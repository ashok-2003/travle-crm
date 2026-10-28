"use client";

// Templates in the reply box's tools (sales inbox spec, design v2): an approved template may be sent at any time, inside
// the 24-hour window as well as after it, so the button is always there beside the other tools.
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SendTemplateDialog } from "./send-template-dialog";

export function TemplateTool({
  conversationId,
  disabled,
  listed = false,
}: {
  conversationId: string;
  disabled: boolean;
  /** Drawn as a line of a list (the phone's tools sheet), not as a button in a row. */
  listed?: boolean;
}) {
  const t = useTranslations("inbox.chat.composer");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={button}
        type="button"
        variant="ghost"
        className={cn("shrink-0 gap-1.5 px-2.5 text-muted-foreground", listed && "w-full justify-start gap-2")}
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
