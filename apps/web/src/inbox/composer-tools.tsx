"use client";

// The reply box's tools besides the clip and the emoji (sales inbox spec, design v2): a template, the trip details, the quick
// replies, the payment words and Send later. On a computer they sit in a row under the box; on a phone they wait behind the
// "+" at its left, each with its name, so the box itself keeps the whole width.
import { IndianRupeeIcon, PlusIcon, ZapIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ScheduleButton } from "./schedule-button";
import { TemplateTool } from "./template-tool";
import { SendDetailsTool } from "./trip-kits/send-details-tool";

interface ToolsProps {
  conversationId: string;
  disabled: boolean;
  /** The words in the box, which Send later would hold; none, no Send later. */
  words: string;
  hasFile: boolean;
  windowOpenUntil: string;
  onQuickReplies: () => void;
  onPayment: () => void;
  onScheduled: () => void;
}

function Tools({ layout, ...props }: ToolsProps & { layout: "row" | "list" }) {
  const t = useTranslations("inbox.chat.composer");
  const { conversationId, disabled, words, hasFile, windowOpenUntil, onQuickReplies, onPayment, onScheduled } = props;
  const list = layout === "list";
  const labelled = (label: string, icon: ReactNode, onClick: () => void) => (
    <Button
      type="button"
      variant="ghost"
      className={cn("text-muted-foreground", list && "justify-start gap-2")}
      size={list ? "default" : "icon"}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {list && label}
    </Button>
  );
  return (
    <>
      <TemplateTool conversationId={conversationId} disabled={disabled} />
      <SendDetailsTool conversationId={conversationId} disabled={disabled} />
      {labelled(t("quickReplies"), <ZapIcon aria-hidden="true" />, onQuickReplies)}
      {labelled(t("paymentDetails"), <IndianRupeeIcon aria-hidden="true" />, onPayment)}
      {words !== "" && !hasFile && (
        <ScheduleButton
          conversationId={conversationId}
          windowOpenUntil={windowOpenUntil}
          text={words}
          disabled={disabled}
          onScheduled={onScheduled}
        />
      )}
    </>
  );
}

/** A computer's row of tools, under the box. */
export function ToolsRow(props: ToolsProps) {
  const t = useTranslations("inbox.chat.composer");
  return (
    <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={t("tools")}>
      <Tools layout="row" {...props} />
    </div>
  );
}

/** A phone's "+": the same tools in a sheet from the foot of the screen. */
export function ToolsSheet(props: ToolsProps) {
  const t = useTranslations("inbox.chat.composer");
  const [open, setOpen] = useState(false);
  // A tool that only fills the box (quick replies, payment words) is done at once: the sheet gets out of its way.
  const closing = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={t("tools")}
          disabled={props.disabled}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>{t("tools")}</SheetTitle>
          <SheetDescription className="sr-only">{t("toolsDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-0.5 p-2 [&>button]:justify-start" role="toolbar" aria-label={t("tools")}>
          <Tools
            layout="list"
            {...props}
            onQuickReplies={closing(props.onQuickReplies)}
            onPayment={closing(props.onPayment)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
