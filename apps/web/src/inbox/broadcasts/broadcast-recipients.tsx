"use client";

// The chats a broadcast was made for (sales inbox spec 6) and where each stands: waiting (until when, if it waits for a
// morning), sent, left out with the reason, or not delivered with WhatsApp's reason.
import type { BroadcastRecipient } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDayTime, formatPhoneNumber } from "@/lib/format";
import { useMe } from "@/session/me-context";

const tones: Record<BroadcastRecipient["state"], StatusTone> = {
  waiting: "attention",
  sent: "good",
  skipped: "neutral",
  failed: "bad",
};
const reasons = ["monthly_cap", "opted_out", "no_consent", "cancelled", "unavailable"] as const;
const refusals = ["not_on_whatsapp", "bad_number", "rate_limited", "tier_limit", "provider_down", "unsure"] as const;

export function BroadcastRecipients({ recipients }: { recipients: BroadcastRecipient[] }) {
  const t = useTranslations("inbox.broadcasts");
  const failure = useTranslations("inbox.chat.failure");
  const { timeZone } = useMe().organization;
  if (recipients.length === 0) return <p className="text-muted-foreground">{t("detail.none")}</p>;
  const why = (recipient: BroadcastRecipient): string | null => {
    if (recipient.state === "waiting") {
      return recipient.notBefore !== null
        ? t("detail.waitsUntil", { when: formatDayTime(new Date(recipient.notBefore), { timeZone }) })
        : null;
    }
    if (recipient.state === "failed") {
      const known = refusals.find((code) => code === recipient.reason);
      return known === undefined ? t("reason.other") : failure(known);
    }
    const known = reasons.find((code) => code === recipient.reason);
    return recipient.reason === null ? null : t(`reason.${known ?? "other"}`);
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("detail.column.chat")}</TableHead>
          <TableHead>{t("detail.column.state")}</TableHead>
          <TableHead>{t("detail.column.why")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((recipient) => (
          <TableRow key={recipient.id}>
            <TableCell className="wrap-anywhere">
              {recipient.name ?? t("detail.unnamed")}
              <span className="numbers block text-caption text-muted-foreground">
                {formatPhoneNumber(recipient.phone)}
              </span>
            </TableCell>
            <TableCell>
              <StatusBadge tone={tones[recipient.state]}>{t(`state.${recipient.state}`)}</StatusBadge>
            </TableCell>
            <TableCell className="whitespace-normal">{why(recipient)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
