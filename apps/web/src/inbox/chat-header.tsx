"use client";

// The bar atop a chat (sales inbox spec, sections 3 and 6), as WhatsApp's: on a phone a way back to the chats; the
// person's round picture, their name and phone (which open the contact panel), or "Priya is replying…" while a teammate types
// here; how long the customer has waited; the lead's stage; then search in the chat, the contact panel where the sale is
// worked, and the chat's menu. On a phone the name is the page's title.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { ArrowLeftIcon, PanelRightIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/leads/stage-badge";
import { formatPhoneNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { ChatAvatar } from "./chat-avatar";
import { ChatMenu } from "./chat-menu";
import { WaitTimer } from "./wait-timer";

export function ChatHeader({
  header,
  asPage,
  panelOpen,
  onTogglePanel,
  panelButton,
  searchOpen,
  onToggleSearch,
}: {
  header: ConversationHeader;
  asPage: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  panelButton: Ref<HTMLButtonElement>;
  searchOpen: boolean;
  onToggleSearch: () => void;
}) {
  const t = useTranslations("inbox.chat");
  const name = header.name ?? formatPhoneNumber(header.phone);
  const waitingSince = header.needsReply ? header.lastInboundAt : null;
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 bg-chat-bar px-2 py-2 md:gap-3 md:px-4">
      {asPage && (
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={routes.inbox}>
            <ArrowLeftIcon aria-hidden="true" />
          </Link>
        </Button>
      )}
      {/* As WhatsApp's: the picture opens the contact panel (the lead is a link in there). */}
      <Button type="button" variant="ghost" size="icon" onClick={onTogglePanel} aria-label={t("showContact", { name })}>
        <ChatAvatar name={header.name} />
      </Button>
      <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
        {asPage ? (
          <PageTitle
            className={cn(
              "w-full truncate text-section script-leading md:text-section",
              header.name === null && "numbers",
            )}
          >
            {name}
          </PageTitle>
        ) : (
          <h2
            className={cn(
              "w-full truncate text-section font-semibold script-leading",
              header.name === null && "numbers",
            )}
          >
            {name}
          </h2>
        )}
        <p className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground" aria-live="polite">
          {header.replying.length > 0 ? (
            <span className="truncate font-medium text-primary">
              {t("replying", { names: header.replying.join(", "), count: header.replying.length })}
            </span>
          ) : (
            <>
              {header.name !== null && <span className="numbers truncate">{formatPhoneNumber(header.phone)}</span>}
              {header.optedOut && <span className="text-status-bad-ink">{t("optedOut")}</span>}
            </>
          )}
        </p>
      </div>
      {waitingSince !== null && <WaitTimer since={waitingSince} className="hidden sm:inline-flex" />}
      {header.lead !== null && (
        <div className="hidden shrink-0 2xl:block">
          <StageBadge stage={header.lead.stage as LeadStage} />
        </div>
      )}
      <Button
        type="button"
        variant={searchOpen ? "secondary" : "ghost"}
        size="icon"
        aria-label={t("search")}
        aria-pressed={searchOpen}
        onClick={onToggleSearch}
      >
        <SearchIcon aria-hidden="true" />
      </Button>
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
      <ChatMenu header={header} />
    </header>
  );
}
