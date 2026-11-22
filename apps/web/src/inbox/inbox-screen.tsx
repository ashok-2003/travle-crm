"use client";

// /inbox and /inbox/<id> (spec 3.1; sales inbox spec, section 3; inbox revamp spec, part 1): the shared WhatsApp inbox, edge
// to edge like WhatsApp Web, built once by the chats' layout so choosing a chat never rebuilds the list. On a computer the
// chats on the left and the open chat (the page, `children`) beside them, the chat first (inbox-panes.tsx); on a phone, or
// a screen under 1024px, the chats, and a chat covers the whole screen over them, so Back finds the list as it was. It
// hears the live stream (the app's shell holds it and gives the alerts) and holds the keys. The states: WhatsApp not set
// up for the agency (never naming MSG91), the connection in trouble or paused, the demo (read only), a load that failed
// with Try again.
import { MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { PageTitle } from "@/components/page-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { routes } from "@/lib/routes";
import { useFillScreen } from "@/lib/use-fill-screen";
import { useHolds } from "@/session/me-context";
import { AlertsMenu } from "./alerts-menu";
import { InboxList } from "./inbox-list";
import { InboxPanesProvider, useInboxTwoPanes, useWidthOf } from "./inbox-panes";
import { NotSetUp } from "./not-set-up";
import { useInboxLive } from "./use-inbox-live";
import { useInboxStatus, usePrefetchInboxLists } from "./use-inbox";
import { useInboxKeys } from "./use-inbox-keys";

/** The page's own padding, for the states that are a page of words rather than the inbox itself. */
function Padded({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 px-4 pt-6 sm:px-6 lg:px-8">{children}</div>;
}

/** The chat the address names, if any. */
export function useOpenChatId(): string | null {
  const params = useParams<{ conversationId?: string }>();
  return typeof params.conversationId === "string" ? params.conversationId : null;
}

/** The keys, inside the panes' provider: Esc closes the contact panel kept open beside the chat. */
function InboxKeys({ conversationId }: { conversationId: string | null }) {
  useInboxKeys(conversationId);
  return null;
}

export function InboxScreen({ children }: { children: ReactNode }) {
  const t = useTranslations("inbox");
  const twoPanes = useInboxTwoPanes();
  const conversationId = useOpenChatId();
  const status = useInboxStatus();
  usePrefetchInboxLists();
  useInboxLive({ openId: conversationId });
  const mayBroadcast = useHolds("inbox:templates");

  const fill = useFillScreen<HTMLDivElement>();
  const width = useWidthOf(fill.ref);
  const frame = (content: ReactNode) => (
    // Exactly the height left on screen, so the reply bar is always in view and only the lists inside scroll.
    <div
      ref={fill.ref}
      style={fill.style}
      data-bleed
      className="flex h-[calc(100dvh-3.5rem-var(--phone-navigation-height))] flex-col overflow-hidden md:h-dvh"
    >
      <InboxPanesProvider width={width}>{content}</InboxPanesProvider>
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
        <div className="flex items-center gap-1">
          {mayBroadcast && (
            <Button asChild variant="ghost">
              <Link href={routes.broadcasts}>
                <MegaphoneIcon aria-hidden="true" />
                {t("broadcasts.open")}
              </Link>
            </Button>
          )}
          <AlertsMenu />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <InboxList currentId={conversationId} />
      </div>
    </div>
  );

  return frame(
    <>
      {banner}
      {twoPanes ? (
        // The list a share of the inbox between 300 and 400px; the chat everything left.
        <div className="grid min-h-0 flex-1 grid-cols-[clamp(300px,24%,400px)_auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
          {listPane}
          <Separator orientation="vertical" />
          {children}
        </div>
      ) : (
        <>
          {listPane}
          {children}
        </>
      )}
      <InboxKeys conversationId={conversationId} />
    </>,
  );
}
