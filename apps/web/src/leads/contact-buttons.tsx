"use client";

// Reaching a lead's person (R48): Call is the main button and dials on a phone; on a wide screen, which has no dialler,
// it shows the number with Copy. WhatsApp opens the chat with the number (wa.me, digits only) and is an outline
// button: never green (status) or violet (people). Show them only when the person has a phone.
import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatPhoneNumber } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";

type Variant = "default" | "outline" | "ghost";

/** The chat with a number in WhatsApp: https://wa.me/ and its digits, without the "+". */
export function whatsAppLink(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

export function CallButton({ phone, name, variant = "default" }: { phone: string; name: string; variant?: Variant }) {
  const t = useTranslations("leads.contact");
  const wide = useWideScreen();
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
        <a href={`tel:${phone}`} aria-label={label}>
          {content}
        </a>
      </Button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={variant} aria-label={label}>
          {content}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={label}>
        <p className="text-muted-foreground">{t("callFrom", { name })}</p>
        <p className="numbers text-number-lg">{formatPhoneNumber(phone)}</p>
        <CopyButton value={phone} label={t("copyNumber", { name })} />
      </PopoverContent>
    </Popover>
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
