"use client";

// What sits under the messages for someone who may reply (spec 3.2; sales inbox spec 6): the messages scheduled for later,
// then the reply box (a team note, on the chat's lead, never sent and good whatever the window, is a tool in its "+": it
// turns the box into the note box until the person goes back, and each box keeps its own words meanwhile) while the 24-hour window is open, or a plain line instead when it has closed, the customer never wrote,
// the chat's own number is paused or this is the demo (Mark as answered is in the chat's menu). A chat on a disconnected
// number can't be answered: it says so and offers Start a chat, which opens the customer's chat by the sending rule (the
// number they last wrote to, else the main one). Someone who may only read sees nothing here.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { AiReplyBar } from "@/ai/ai-turn";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { Composer } from "./composer";
import { ScheduledList } from "./scheduled-list";
import { TeamNoteComposer } from "./team-note-composer";
import { SendTemplateDialog } from "./send-template-dialog";
import { StartChat } from "./start-chat";
import { useInboxStatus } from "./use-inbox";
import { useNumbers } from "./use-numbers";

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
  const tErrors = useTranslations("errors");
  const { timeZone } = useMe().organization;
  const mayReply = useHolds("inbox:reply");
  const status = useInboxStatus();
  const { labelOf } = useNumbers();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  // The note box stays mounted once opened, hidden while replying, so its words wait for the person's return.
  const [noteOpened, setNoteOpened] = useState(false);
  if (!mayReply || header.state !== "open") return null;

  const openNote =
    header.lead === null
      ? null
      : () => {
          setNoteOpened(true);
          setMode("note");
        };
  const box = () => {
    if (status.data?.demo === true) return <Note>{t("replyDemo")}</Note>;
    // An older api says nothing of the chat's number (the release window): the box behaves as it did before.
    const number = mayBeMissing(header.number);
    if (number?.status === "disconnected") {
      return (
        <div className="flex flex-col gap-2">
          <Note>{tErrors("reasons.WHATSAPP_NUMBER_DISCONNECTED")}</Note>
          {header.lead !== null && <StartChat leadId={header.lead.id} />}
        </div>
      );
    }
    if (number?.status === "paused") {
      const label = labelOf(number.id);
      return <Note>{label === null ? t("replyPaused") : t("replyNumberPaused", { label })}</Note>;
    }
    if (header.windowOpenUntil !== null) {
      // One box per chat: its words are that chat's own, and never carried over to another when the address changes.
      return (
        <>
          <AiReplyBar conversationId={header.id} />
          <Composer key={header.id} header={header} windowOpenUntil={header.windowOpenUntil} onNote={openNote} />
        </>
      );
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
  const writingNote = mode === "note" && header.lead !== null;
  return (
    <div className="flex flex-col gap-2">
      {noteOpened && header.lead !== null && (
        <div hidden={!writingNote}>
          <TeamNoteComposer
            conversationId={header.id}
            leadId={header.lead.id}
            onBack={() => {
              setMode("reply");
            }}
          />
        </div>
      )}
      {!writingNote && (
        <>
          <ScheduledList conversationId={header.id} />
          {box()}
        </>
      )}
    </div>
  );
}
