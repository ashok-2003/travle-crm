"use client";

// The failed emails on tablets and wider (DESIGN.md section 6): a table, newest first, each email's subject leading to
// its page. Addresses and codes wrap rather than being cut off.
import type { FailedEmail } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useInstantText } from "@/components/instant-text";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { consoleRoutes } from "../routes";
import { useEmailWords } from "./email-words";

export function FailedEmailsTable({ emails }: { emails: FailedEmail[] }) {
  const t = useTranslations("consolePlatform.emails");
  const instantText = useInstantText();
  const words = useEmailWords();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.failedAt")}</TableHead>
          <TableHead scope="col">{t("columns.subject")}</TableHead>
          <TableHead scope="col">{t("columns.to")}</TableHead>
          <TableHead scope="col">{t("columns.purpose")}</TableHead>
          <TableHead scope="col">{t("columns.failure")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {emails.map((email) => (
          <TableRow key={email.id}>
            <TableCell className="numbers">{instantText(email.failedAt)}</TableCell>
            <TableCell className="whitespace-normal">
              <TextLink href={consoleRoutes.email(email.id)} inline>
                <span className="wrap-anywhere">{email.subject}</span>
              </TextLink>
            </TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col">
                {email.toName !== null && <span>{email.toName}</span>}
                <span className="text-caption wrap-anywhere text-muted-foreground">{email.toAddress}</span>
              </div>
            </TableCell>
            <TableCell>{words.purpose(email.purpose)}</TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col items-start gap-1">
                <span>
                  {words.source(email.failureSource)}{" "}
                  <span className="numbers text-caption break-all">{email.failureCode}</span>
                </span>
                {email.failureReason !== null && (
                  <span className="text-caption wrap-anywhere text-muted-foreground">{email.failureReason}</span>
                )}
                {email.resent && <StatusBadge tone="good">{t("resent")}</StatusBadge>}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
