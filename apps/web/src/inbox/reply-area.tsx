"use client";

// What sits under the messages for someone who may reply (spec 3.2; sales inbox spec 6): a choice of Reply or Note (a note
// for the team, never sent, which works whatever the window), the messages scheduled for later, then the reply box while
// the 24-hour window is open, or a plain line instead when it has closed, the customer never wrote, the number is paused
// or this is the demo (Mark as answered is in the chat's menu). Someone who may only read sees nothing here.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { MessageSquareIcon, StickyNoteIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Composer } from "./composer";
import { ScheduledList } from "./scheduled-list";
import { TeamNoteComposer } from "./team-note-composer";
import { SendTemplateDialog } from "./send-template-dialog";
import { useInboxStatus } from "./use-inbox";

const WINDOW_MS = 24 * 3_600_000;

function Note({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <Item variant="muted" size="sm">
      <ItemContent>
        <ItemDescription className="line-clamp-none">{children}</ItemDescription>
      </ItemContent>
      {action !== undefined && <ItemActions>{action}</ItemActions>}
    </Item>
  );
}

/** Send a template: the only way to write when the window is closed, or to a person who never wrote. */
function TemplateButton({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat");
  const access = useWriteAccess("change");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={button}
        type="button"
        disabled={!access.allowed}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("sendTemplate")}
      </Button>
      <SendTemplateDialog conversationId={conversationId} open={open} onOpenChange={setOpen} returnFocusTo={button} />
    </>
  );
}

export function ReplyArea({ header }: { header: ConversationHeader }) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const mayReply = useHolds("inbox:reply");
  const status = useInboxStatus();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  if (!mayReply || header.state !== "open") return null;

  const box = () => {
    if (status.data?.demo === true) return <Note>{t("replyDemo")}</Note>;
    if (status.data?.connectionStatus === "paused") return <Note>{t("replyPaused")}</Note>;
    if (header.windowOpenUntil !== null) {
      return <Composer header={header} windowOpenUntil={header.windowOpenUntil} />;
    }
    const action =
      header.optedOut && header.lastInboundAt === null ? undefined : <TemplateButton conversationId={header.id} />;
    if (header.lastInboundAt === null)
      return <Note action={action}>{header.optedOut ? t("optedOut") : t("windowNever")}</Note>;
    const closed = new Date(new Date(header.lastInboundAt).getTime() + WINDOW_MS);
    return (
      <Note action={header.optedOut ? undefined : action}>
        {t(header.optedOut ? "windowClosedOptedOut" : "windowClosed", { closed: formatDayTime(closed, { timeZone }) })}
      </Note>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          aria-label={t("composeAs")}
          value={mode}
          onValueChange={(chosen) => {
            if (chosen === "reply" || chosen === "note") setMode(chosen);
          }}
        >
          <ToggleGroupItem value="reply" className="rounded-full px-3">
            <MessageSquareIcon aria-hidden="true" />
            {t("modeReply")}
          </ToggleGroupItem>
          <ToggleGroupItem value="note" className="rounded-full px-3">
            <StickyNoteIcon aria-hidden="true" />
            {t("modeNote")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "note" ? (
        <TeamNoteComposer conversationId={header.id} />
      ) : (
        <>
          <ScheduledList conversationId={header.id} />
          {box()}
        </>
      )}
    </div>
  );
}
