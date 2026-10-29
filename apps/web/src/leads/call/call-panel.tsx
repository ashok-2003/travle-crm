"use client";

// The call panel (release 5, scope 3.4): the number to read, copy or dial from this device, Send to my phone, and a QR
// code that dials when a phone's camera reads it. There is no phone provider here: the person's own phone does the
// calling. The QR is drawn in the browser, so the number goes nowhere. Log the call writes it up afterwards.
import { PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { QrCode } from "@/account/qr-code";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { formatPhoneNumber } from "@/lib/format";
import { rememberDial } from "./pending-call";
import { SendToPhoneButton } from "./send-to-phone-button";

export function CallPanel({
  leadId,
  name,
  phone,
  onLogCall,
}: {
  leadId: string;
  name: string;
  phone: string;
  /** Opens the call's note, for a call made some other way (the phone's own dialler, a QR). */
  onLogCall?: () => void;
}) {
  const t = useTranslations("leads.call");
  const tContact = useTranslations("leads.contact");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground">{tContact("callFrom", { name })}</p>
        <p className="numbers text-number-lg">{formatPhoneNumber(phone)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={phone} label={tContact("copyNumber", { name })} />
        <Button asChild variant="outline">
          <a
            href={`tel:${phone}`}
            onClick={() => {
              rememberDial({ leadId, name });
            }}
          >
            <PhoneIcon aria-hidden="true" />
            {t("dial")}
          </a>
        </Button>
      </div>
      <SendToPhoneButton leadId={leadId} />
      <div className="flex flex-col items-start gap-1">
        <QrCode value={`tel:${phone}`} label={t("qrLabel", { name })} className="size-40 text-foreground" />
        <p className="text-label text-muted-foreground">{t("qrHint")}</p>
      </div>
      {onLogCall && (
        <Button type="button" variant="outline" className="self-start" onClick={onLogCall}>
          {t("logCall")}
        </Button>
      )}
    </div>
  );
}
