"use client";

// The agency's UPI QR on its quote settings (no amount): scan it, pay ₹1, check it arrived, then "Mark as verified", which
// records who and when. Customers see the QR on their page and in the PDF only once it is verified.
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { QrCode } from "@/account/qr-code";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";
import { useMe } from "@/session/me-context";
import { WriteHint } from "@/subscription/write-hint";
import { useVerifyUpi } from "./use-quotes";

export function UpiQrPreview({
  link,
  upiId,
  verifiedAt,
  verifiedByName,
  writeHint,
}: {
  link: string;
  upiId: string;
  /** When it was verified; missing from an older api, which reads as not verified. */
  verifiedAt: string | null | undefined;
  verifiedByName: string | null | undefined;
  /** Why the subscription refuses a change, or null when it allows one. */
  writeHint: string | null;
}) {
  const t = useTranslations("quotes.settings");
  const { timeZone } = useMe().organization;
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const verify = useVerifyUpi(() => {
    setAsking(false);
  });
  const at = mayBeMissing(verifiedAt);
  return (
    <div className="flex flex-col items-start gap-2">
      <QrCode value={link} label={t("upiQrLabel", { upiId })} className="size-40 text-foreground" />
      <p className="text-muted-foreground">{t("upiQrTest")}</p>
      {at ? (
        <p className="font-medium">
          {t("upiVerified", {
            name: verifiedByName ?? t("upiVerifiedFormerMember"),
            when: formatDayTime(new Date(at), { timeZone }),
          })}
        </p>
      ) : (
        <>
          <p className="font-medium">{t("upiUnverified")}</p>
          <Button
            ref={opener}
            type="button"
            variant="outline"
            disabled={writeHint !== null}
            aria-describedby={writeHint === null ? undefined : "upi-verify-hint"}
            onClick={() => {
              setAsking(true);
            }}
          >
            {t("upiVerify")}
          </Button>
          <WriteHint id="upi-verify-hint" hint={writeHint} />
          <ConfirmDialog
            open={asking}
            onOpenChange={setAsking}
            title={t("upiVerifyTitle")}
            description={t("upiVerifyConfirm")}
            action={t("upiVerifyAction")}
            destructive={false}
            request={verify}
            onConfirm={() => {
              verify.mutate({});
            }}
            returnFocusTo={opener}
          />
        </>
      )}
    </div>
  );
}
