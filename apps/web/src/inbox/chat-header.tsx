"use client";

// The bar atop a chat (sales inbox spec, section 3), as WhatsApp's: on a phone a way back to the chats; the person's
// round picture, their name (a link to their lead) and phone; the lead's stage; and the button that shows the contact
// panel, where the sale is worked. On a phone the name is the page's title.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { ArrowLeftIcon, PanelRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import { PageTitle } from "@/components/page-title";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/leads/stage-badge";
import { formatPhoneNumber } from "@/lib/format";
import { leadRoute, routes } from "@/lib/routes";
import { ChatAvatar } from "./chat-avatar";

export function ChatHeader({
  header,
  asPage,
  panelOpen,
  onTogglePanel,
  panelButton,
}: {
  header: ConversationHeader;
  asPage: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  panelButton: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations("inbox.chat");
  const name = header.name ?? formatPhoneNumber(header.phone);
  const title =
    header.lead === null ? (
      name
    ) : (
      <TextLink inline href={leadRoute(header.lead.id)}>
        {name}
      </TextLink>
    );
  return (
    <header className="flex shrink-0 items-center gap-3 bg-background px-2 py-2 md:px-4">
      {asPage && (
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={routes.inbox}>
            <ArrowLeftIcon aria-hidden="true" />
          </Link>
        </Button>
      )}
      <button
        type="button"
        className="flex size-11 shrink-0 items-center justify-center rounded-full"
        onClick={onTogglePanel}
        aria-label={t("showContact", { name })}
      >
        <ChatAvatar name={header.name} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        {asPage ? (
          <PageTitle className="truncate font-sans text-section font-semibold script-leading md:text-section">
            {title}
          </PageTitle>
        ) : (
          <h2 className="truncate text-section font-semibold script-leading">{title}</h2>
        )}
        <p className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
          {header.name !== null && <span className="numbers truncate">{formatPhoneNumber(header.phone)}</span>}
          {header.optedOut && <span className="text-status-bad-ink">{t("optedOut")}</span>}
        </p>
      </div>
      {header.lead !== null && (
        <div className="hidden shrink-0 sm:block">
          <StageBadge stage={header.lead.stage as LeadStage} />
        </div>
      )}
      <Button
        ref={panelButton}
        type="button"
        variant={panelOpen ? "secondary" : "ghost"}
        size="icon"
        aria-label={t("contactPanel")}
        aria-pressed={panelOpen}
        onClick={onTogglePanel}
      >
        <PanelRightIcon aria-hidden="true" />
      </Button>
    </header>
  );
}
