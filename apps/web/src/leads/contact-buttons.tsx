"use client";

// Reaching a lead's person (R48): Call is the main button and dials on a phone (and asks how the call went when the
// person comes back); on a wide screen, which has no dialler, it opens the call panel: the number with Copy, Send to my
// phone and a QR code that dials (release 5). WhatsApp opens the customer's chat in the agency's inbox when its WhatsApp
// is connected (web revamp, 2026-11-18), else the chat with the number in WhatsApp itself (wa.me, digits only). Both
// wear the glyphs people know from their phones (WhatsApp's logo in its own green), and in a table's rows come compact:
// the glyph alone, as a GlyphButton (quiet, named, no tooltip). Show them only when the person has a phone.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { CallGlyph, WhatsAppLogo } from "@/components/contact-icons";
import { GlyphButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTRPC } from "@/data/trpc";
import { inboxRoute, leadChatRoute } from "@/lib/routes";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useHolds } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";
import { CallNoteDialog } from "./call/call-note-dialog";
import { CallPanel } from "./call/call-panel";
import { rememberDial } from "./call/pending-call";

type Variant = "default" | "outline" | "ghost";

/** The chat with a number in WhatsApp: https://wa.me/ and its digits, without the "+". */
export function whatsAppLink(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

export function CallButton({
  phone,
  name,
  leadId,
  variant = "default",
  compact = false,
}: {
  phone: string;
  name: string;
  leadId: string;
  variant?: Variant;
  /** The glyph alone (GlyphButton), for a table's rows. */
  compact?: boolean;
}) {
  const t = useTranslations("leads.contact");
  const wide = useWideScreen();
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const label = t("callPerson", { name });
  const Shape = compact ? GlyphButton : Button;
  const shown = compact ? "quiet" : variant;
  const content = (
    <>
      <CallGlyph className="size-5" />
      {!compact && t("call")}
    </>
  );
  if (!wide) {
    return (
      <Shape asChild variant={shown} aria-label={label}>
        <a
          href={`tel:${phone}`}
          onClick={() => {
            // On coming back, the app asks how the call went.
            rememberDial({ leadId, name });
          }}
        >
          {content}
        </a>
      </Shape>
    );
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Shape ref={button} variant={shown} aria-label={label}>
            {content}
          </Shape>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={label} className="w-80">
          <CallPanel
            leadId={leadId}
            name={name}
            phone={phone}
            onLogCall={() => {
              setOpen(false);
              setLogging(true);
            }}
          />
        </PopoverContent>
      </Popover>
      <CallNoteDialog
        leadId={leadId}
        name={name}
        held={{ open: logging, setOpen: setLogging }}
        returnFocusTo={button}
      />
    </>
  );
}

/** WhatsApp through the agency's inbox: the customer's chat, or their lead's WhatsApp section to start one. */
function InboxWhatsAppButton({
  leadId,
  label,
  variant,
  compact,
  children,
}: {
  leadId: string;
  label: string;
  variant: Variant;
  compact: boolean;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const Shape = compact ? GlyphButton : Button;
  const open = async () => {
    setOpening(true);
    try {
      // Asked on the click, not per row on render: a list shows many of these buttons.
      const chat = await queryClient.query(trpc.inbox.leadChat.queryOptions({ leadId }));
      router.push(chat.conversationId === null ? leadChatRoute(leadId) : inboxRoute(chat.conversationId));
    } catch {
      // The lead's page holds its chat, or the way to start one, and says there what went wrong.
      router.push(leadChatRoute(leadId));
    } finally {
      setOpening(false);
    }
  };
  return (
    <Shape variant={compact ? "quiet" : variant} aria-label={label} disabled={opening} onClick={() => void open()}>
      {children}
    </Shape>
  );
}

export function WhatsAppButton({
  phone,
  name,
  leadId,
  variant = "outline",
  compact = false,
}: {
  phone: string;
  name: string;
  leadId: string;
  variant?: Variant;
  /** The glyph alone (GlyphButton), for a table's rows. */
  compact?: boolean;
}) {
  const t = useTranslations("leads.contact");
  const trpc = useTRPC();
  // Our inbox when the member may use it, the plan has it (still loading counts as having it, as the lead page does) and
  // the agency's number is connected; otherwise WhatsApp itself.
  const mayRead = useHolds("inbox:view");
  const modules = useSubscription().data?.modules;
  const onPlan = modules === undefined || modules.includes("inbox");
  const status = useQuery({ ...trpc.inbox.status.queryOptions(), enabled: mayRead && onPlan, staleTime: 60_000 });
  const label = t("whatsAppPerson", { name });
  const content = (
    <>
      <WhatsAppLogo className="size-5 text-whatsapp-logo" />
      {!compact && t("whatsApp")}
    </>
  );
  if (mayRead && onPlan && status.data?.connected === true) {
    return (
      <InboxWhatsAppButton leadId={leadId} label={label} variant={variant} compact={compact}>
        {content}
      </InboxWhatsAppButton>
    );
  }
  const Shape = compact ? GlyphButton : Button;
  return (
    <Shape asChild variant={compact ? "quiet" : variant} aria-label={label}>
      <a href={whatsAppLink(phone)} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    </Shape>
  );
}
