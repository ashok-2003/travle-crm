"use client";

// An email's resends, oldest first: each one's outcome and when, and a failure's code.
import type { EmailResend, EmailStatus } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useInstantText } from "@/components/instant-text";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

const tones: Record<EmailStatus, StatusTone> = { sent: "good", failed: "bad", sending: "neutral" };
const words = { sent: "resendSent", failed: "resendFailed", sending: "resendSending" } as const;

export function EmailResends({ resends }: { resends: EmailResend[] }) {
  const t = useTranslations("consolePlatform.emails.email");
  const instantText = useInstantText();
  if (resends.length === 0) return <p className="text-muted-foreground">{t("noResends")}</p>;
  return (
    <ItemGroup>
      {resends.map((resend) => (
        <Item key={resend.id} size="sm" role="listitem">
          <ItemContent>
            <ItemTitle className="flex-wrap">
              <StatusBadge tone={tones[resend.status]}>{t(words[resend.status])}</StatusBadge>
              <span className="numbers">{instantText(resend.sentAt ?? resend.failedAt ?? resend.createdAt)}</span>
            </ItemTitle>
            {resend.failureCode !== null && (
              <ItemDescription className="numbers break-all">
                {t("resendCode", { code: resend.failureCode })}
              </ItemDescription>
            )}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
