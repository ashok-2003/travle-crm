"use client";

// The failed emails on phones (DESIGN.md section 6): a list of items, each leading to the email's page, with its
// subject first, who it was for, and what happened and when below; the table and the email's page have the rest.
import type { FailedEmail } from "@travel-crm/contracts/platform";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { useInstantText } from "@/components/instant-text";
import { StatusBadge } from "@/components/status-badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { consoleRoutes } from "../routes";
import { useEmailWords } from "./email-words";

export function FailedEmailsList({ emails }: { emails: FailedEmail[] }) {
  const t = useTranslations("consolePlatform.emails");
  const instantText = useInstantText();
  const words = useEmailWords();
  return (
    <ItemGroup>
      {emails.map((email, index) => (
        <Fragment key={email.id}>
          {index > 0 && <ItemSeparator />}
          <div role="listitem">
            <Item size="sm" asChild>
              <Link href={consoleRoutes.email(email.id)}>
                <ItemContent>
                  <ItemTitle className="flex-wrap">
                    <span className="wrap-anywhere">{email.subject}</span>
                    {email.resent && <StatusBadge tone="good">{t("resent")}</StatusBadge>}
                  </ItemTitle>
                  <ItemDescription className="wrap-anywhere">{email.toAddress}</ItemDescription>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-label">
                    <span>{words.source(email.failureSource)}</span>
                    <span className="numbers text-caption wrap-anywhere">{email.failureCode}</span>
                    <span className="numbers text-muted-foreground">{instantText(email.failedAt)}</span>
                  </span>
                </ItemContent>
              </Link>
            </Item>
          </div>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
