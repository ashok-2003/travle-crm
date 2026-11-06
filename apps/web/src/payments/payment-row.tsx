"use client";

// One payment waiting for a person: who and which trip, what was asked and what the customer says they paid, the
// screenshot to look at (for anyone who checks payments), and the decision. A claim or an AI booking is confirmed or not
// received; a screenshot no booking waits for can only be matched in its chat, or dismissed. Nothing here records money.
import type { PaymentToCheck } from "@travel-crm/contracts/bookings";
import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useTRPCClient } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { formatCalendarDay, formatDay } from "@/lib/format";
import { openInNewTab } from "@/lib/open-in-new-tab";
import { inboxRoute, leadRoute } from "@/lib/routes";
import { useHolds, useMe } from "@/session/me-context";
import { ConfirmPaymentDialog } from "./confirm-payment-dialog";
import { DismissProofDialog, RefusePaymentDialog } from "./refuse-payment-dialog";

/** The screenshot's button: it opens in a tab of its own, for whoever may check payments (not only who reads chats). */
function ScreenshotButton({ payment }: { payment: PaymentToCheck }) {
  const t = useTranslations("payments");
  const client = useTRPCClient();
  const { apiError } = useErrorMessage();
  if (payment.screenshot === null) return null;
  return (
    <Button
      variant="outline"
      aria-label={t("screenshotOf", { name: payment.person.name })}
      onClick={() => {
        openInNewTab(() => client.paymentsToCheck.screenshotLink.query({ kind: payment.kind, id: payment.id })).catch(
          (error: unknown) => {
            toast.error(apiError(error));
          },
        );
      }}
    >
      <ImageIcon aria-hidden="true" />
      {t("screenshot")}
    </Button>
  );
}

export function PaymentRow({ payment, hintId }: { payment: PaymentToCheck; hintId: string }) {
  const t = useTranslations("payments");
  const { timeZone } = useMe().organization;
  const { kind } = payment;
  const name = payment.person.name === "" ? t("unknownPerson") : payment.person.name;
  // Someone who checks payments may not read leads or chats (Accounts): then the name is plain and the chat isn't offered.
  const seesLeads = useHolds("leads:view");
  const readsChats = useHolds("inbox:view");
  const trip = [payment.trip, payment.date === null ? null : formatCalendarDay(payment.date)]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <TableRow>
      <TableCell>
        {payment.person.leadId === null || !seesLeads ? (
          <span className="font-medium">{name}</span>
        ) : (
          <TextLink inline href={leadRoute(payment.person.leadId)}>
            {name}
          </TextLink>
        )}
        {trip !== "" && <p className="text-muted-foreground">{trip}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusBadge tone="attention">{t(`kinds.${kind}`)}</StatusBadge>
          <span className="text-caption text-muted-foreground">
            {t("waitingSince", { day: formatDay(new Date(payment.waitingSince), { timeZone }) })}
          </span>
        </div>
      </TableCell>
      <TableCell className="numbers">
        {payment.expectedPaise === null && payment.claimedPaise === null && (
          <span className="text-muted-foreground">{t("noAmount")}</span>
        )}
        {payment.expectedPaise !== null && <p>{t("expected", { amount: rupees(payment.expectedPaise) })}</p>}
        {payment.claimedPaise !== null && <p>{t("claimed", { amount: rupees(payment.claimedPaise) })}</p>}
        {payment.reference !== null && (
          <p className="text-caption text-muted-foreground">{t("reference", { reference: payment.reference })}</p>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <ScreenshotButton payment={payment} />
          {kind === "proof" ? (
            <>
              {payment.conversationId !== null && readsChats && (
                <Button asChild variant="outline" aria-label={t("openChatOf", { name })}>
                  <Link href={inboxRoute(payment.conversationId)}>{t("openChat")}</Link>
                </Button>
              )}
              <DismissProofDialog payment={payment} describedBy={hintId} />
            </>
          ) : (
            <>
              <ConfirmPaymentDialog payment={{ ...payment, kind }} describedBy={hintId} />
              <RefusePaymentDialog payment={{ ...payment, kind }} describedBy={hintId} />
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
