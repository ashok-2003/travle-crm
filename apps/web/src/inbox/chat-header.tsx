"use client";

// The bar atop a chat (sales inbox spec, sections 3, 6 and design v2), as the sales inboxes teams know: on a phone a way
// back; the person's tinted picture, their name, and under it their phone and how long the 24-hour window stays open, or
// "Priya is replying…" while a teammate types here; then the sale worked in place (the lead's owner and its stage as
// menus, on a wide screen; in the contact panel otherwise), how long the customer has waited, search in the chat, a call,
// the contact panel and the chat's menu. On a phone the name is the page's title.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { ArrowLeftIcon, PanelRightIcon, PhoneIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { formatPhoneNumber } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./chat-avatar";
import { OwnerMenu, StageMenu, WindowChip } from "./chat-lead-controls";
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
  const titleClass = cn("w-full truncate text-section font-semibold script-leading", header.name === null && "numbers");
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 bg-surface px-2 py-2 md:gap-3 md:px-4">
      {asPage && (
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={routes.inbox}>
            <ArrowLeftIcon aria-hidden="true" />
          </Link>
        </Button>
      )}
      {/* As WhatsApp's: the picture opens the contact panel (the lead is a link in there). */}
      <Button type="button" variant="ghost" size="icon" onClick={onTogglePanel} aria-label={t("showContact", { name })}>
        <ChatAvatar name={header.name} seed={header.id} />
      </Button>
      <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
        {asPage ? (
          <PageTitle className={cn(titleClass, "font-sans md:text-section")}>{name}</PageTitle>
        ) : (
          <h2 className={titleClass}>{name}</h2>
        )}
        <p className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground" aria-live="polite">
          {header.replying.length > 0 ? (
            <span className="truncate font-medium text-primary">
              {t("replying", { names: header.replying.join(", "), count: header.replying.length })}
            </span>
          ) : (
            <>
              {header.name !== null && <span className="numbers truncate">{formatPhoneNumber(header.phone)}</span>}
              <WindowChip header={header} />
              {header.optedOut && <span className="text-status-bad-ink">{t("optedOut")}</span>}
            </>
          )}
        </p>
      </div>
      {waitingSince !== null && <WaitTimer since={waitingSince} className="hidden sm:inline-flex" />}
      {/* The sale in place where there is room (more of it with the panel shut); the contact panel holds the same. */}
      <div className={cn("hidden items-center gap-2", panelOpen ? "2xl:flex" : "lg:flex")}>
        <OwnerMenu header={header} />
        <StageMenu header={header} />
      </div>
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
      <Button asChild variant="ghost" size="icon" aria-label={t("call", { name })}>
        <a href={`tel:${header.phone}`}>
          <PhoneIcon aria-hidden="true" />
        </a>
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
