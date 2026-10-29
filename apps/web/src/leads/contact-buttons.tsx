"use client";

// Reaching a lead's person (R48): Call is the main button and dials on a phone (and asks how the call went when the
// person comes back); on a wide screen, which has no dialler, it opens the call panel: the number with Copy, Send to my
// phone and a QR code that dials (release 5). WhatsApp opens the chat with the number (wa.me, digits only) and is an outline
// button: never green (status) or violet (people). Show them only when the person has a phone.
import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWideScreen } from "@/lib/use-wide-screen";
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
}: {
  phone: string;
  name: string;
  leadId: string;
  variant?: Variant;
}) {
  const t = useTranslations("leads.contact");
  const wide = useWideScreen();
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const label = t("callPerson", { name });
  const content = (
    <>
      <PhoneIcon aria-hidden="true" />
      {t("call")}
    </>
  );
  if (!wide) {
    return (
      <Button asChild variant={variant}>
        <a
          href={`tel:${phone}`}
          aria-label={label}
          onClick={() => {
            // On coming back, the app asks how the call went.
            rememberDial({ leadId, name });
          }}
        >
          {content}
        </a>
      </Button>
    );
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button ref={button} variant={variant} aria-label={label}>
            {content}
          </Button>
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

export function WhatsAppButton({
  phone,
  name,
  variant = "outline",
}: {
  phone: string;
  /** Names the link where several sit together (a list's rows). */
  name?: string;
  variant?: Variant;
}) {
  const t = useTranslations("leads.contact");
  return (
    <Button asChild variant={variant}>
      <a
        href={whatsAppLink(phone)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={name === undefined ? undefined : t("whatsAppPerson", { name })}
      >
        <MessageCircleIcon aria-hidden="true" />
        {t("whatsApp")}
      </a>
    </Button>
  );
}
