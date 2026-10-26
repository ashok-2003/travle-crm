"use client";

// /inbox and /inbox/<id> (spec 3.1; sales inbox spec, section 3): the shared WhatsApp inbox, edge to edge like WhatsApp
// Web. On a computer the chats on the left and the open chat beside them (with its contact panel); on a phone the chats,
// and a chat covers the whole screen with its own top bar and a way back. The states: WhatsApp not set up for the agency
// (never naming MSG91), the connection in trouble or paused, the demo (read only), a load that failed with Try again.
import { MegaphoneIcon, MessageCircleIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { PageTitle } from "@/components/page-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { routes } from "@/lib/routes";
import { useFillScreen } from "@/lib/use-fill-screen";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useHolds } from "@/session/me-context";
import { ChatPanel } from "./chat-panel";
import { InboxList } from "./inbox-list";
import { NotSetUp } from "./not-set-up";
import { useInboxStatus } from "./use-inbox";
import { useInboxKeys } from "./use-inbox-keys";

/** The page's own padding, for the states that are a page of words rather than the inbox itself. */
function Padded({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 px-4 pt-6 sm:px-6 lg:px-8">{children}</div>;
}

export function InboxScreen({ conversationId }: { conversationId: string | null }) {
  const t = useTranslations("inbox");
  const wide = useWideScreen();
  const status = useInboxStatus();
  useInboxKeys(conversationId);
  const mayBroadcast = useHolds("inbox:templates");

  const fill = useFillScreen<HTMLDivElement>();
  const frame = (children: ReactNode) => (
    // Exactly the height left on screen, so the reply bar is always in view and only the lists inside scroll.
    <div
      ref={fill.ref}
      style={fill.style}
      data-bleed
      className="flex h-[calc(100dvh-3.5rem-var(--phone-navigation-height))] flex-col overflow-hidden md:h-dvh"
    >
      {children}
    </div>
  );

  if (status.data === undefined) {
    return frame(
      <Padded>
        <PageHeader title={t("title")} intro={t("intro")} />
        {status.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={status.error}
            retryLabel={t("chat.retry")}
            onRetry={() => void status.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )}
      </Padded>,
    );
  }
  const { configured, connected, connectionStatus, demo } = status.data;
  if (!configured || !connected) {
    return frame(
      <Padded>
        <PageHeader title={t("title")} intro={t("intro")} />
        <NotSetUp />
      </Padded>,
    );
  }
  const notice =
    connectionStatus === "problem"
      ? t("problem")
      : connectionStatus === "paused"
        ? t("paused")
        : demo
          ? t("demo")
          : null;
  const banner = notice !== null && (
    <Alert className="shrink-0 rounded-none">
      <AlertDescription>{notice}</AlertDescription>
    </Alert>
  );
  const listPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* WhatsApp's bar atop the chats. */}
      <div className="flex min-h-16 shrink-0 items-center justify-between gap-2 bg-surface px-4">
        <PageTitle>{t("title")}</PageTitle>
        {mayBroadcast && (
          <Button asChild variant="ghost">
            <Link href={routes.broadcasts}>
              <MegaphoneIcon aria-hidden="true" />
              {t("broadcasts.open")}
            </Link>
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <InboxList currentId={conversationId} />
      </div>
    </div>
  );

  if (!wide) {
    return frame(
      <>
        {banner}
        {listPane}
        {/* On a phone a chat covers the screen, its top bar and bottom bar included, as WhatsApp's does. */}
        {conversationId !== null && (
          <div className="fixed inset-0 z-(--z-overlay) flex flex-col bg-background">
            <ChatPanel conversationId={conversationId} variant="page" />
          </div>
        )}
      </>,
    );
  }
  return frame(
    <>
      {banner}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,24rem)_auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        {listPane}
        <Separator orientation="vertical" />
        {conversationId === null ? (
          <div className="flex items-center justify-center bg-surface">
            <EmptyState icon={MessageCircleIcon} message={t("pickChat")} />
          </div>
        ) : (
          <ChatPanel key={conversationId} conversationId={conversationId} />
        )}
      </div>
    </>,
  );
}
