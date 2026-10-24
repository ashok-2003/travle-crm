"use client";

// One chat (spec 3.2), on the inbox's right, on a phone's page of its own and in the lead's WhatsApp section: the person
// (a link to their lead), the messages oldest at the bottom, a page at a time upward, a day line between days, and what
// the 24-hour window says. Reading only for now: a reply is typed on the phone. The messages refetch while it is open.
import type { ChatMessage, ConversationHeader } from "@travel-crm/contracts/inbox";
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageTitle } from "@/components/page-title";
import { ShowMoreButton } from "@/components/show-more-button";
import { TextLink } from "@/components/text-link";
import { Separator } from "@/components/ui/separator";
import { refusalOf } from "@/data/api-error";
import { formatDay, formatDayTime, formatPhoneNumber } from "@/lib/format";
import { leadRoute } from "@/lib/routes";
import { useHolds, useMe } from "@/session/me-context";
import { MessageBubble } from "./message-bubble";
import { StartLeadButton } from "./start-lead-button";
import { useConversation, useMessages } from "./use-inbox";

/** The calendar day of an instant in the zone, to tell where a new day starts. */
const dayKey = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(instant),
  );

function Header({ header, asPageTitle }: { header: ConversationHeader; asPageTitle: boolean }) {
  const t = useTranslations("inbox.chat");
  const tStages = useTranslations("leads.stages");
  // A number nobody has a name for is shown as the number, in the title's place.
  const name = header.name ?? formatPhoneNumber(header.phone);
  const title = header.lead === null ? name : <TextLink href={leadRoute(header.lead.id)}>{name}</TextLink>;
  return (
    <div className="flex flex-col gap-1">
      {asPageTitle ? (
        <PageTitle className="script-leading">{title}</PageTitle>
      ) : (
        <h2 className="text-section font-semibold script-leading">{title}</h2>
      )}
      {header.name !== null && <p className="numbers text-muted-foreground">{formatPhoneNumber(header.phone)}</p>}
      {header.lead !== null && (
        <p className="text-label">{t("stage", { stage: tStages(header.lead.stage as never) })}</p>
      )}
      {header.pastCustomer && <p className="text-label">{t("pastCustomer")}</p>}
    </div>
  );
}

function WindowLine({ header }: { header: ConversationHeader }) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  return (
    <p className="text-label text-muted-foreground">
      {header.windowOpenUntil === null
        ? t("windowClosed")
        : t("windowOpen", { until: formatDayTime(new Date(header.windowOpenUntil), { timeZone }) })}
    </p>
  );
}

function Messages({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  const messages = useMessages(conversationId, true);
  if (messages.items === undefined) {
    return messages.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={messages.error}
        retryLabel={t("retry")}
        onRetry={() => void messages.refetch()}
      />
    ) : (
      <LoadingRows shape="twoLines" label={t("loading")} />
    );
  }
  if (messages.items.length === 0) return <p className="text-muted-foreground">{t("noMessages")}</p>;
  // Newest first from the api; the chat reads oldest at the bottom.
  const oldestFirst: ChatMessage[] = [...messages.items].reverse();
  const rows: ReactNode[] = [];
  oldestFirst.forEach((message, index) => {
    const day = dayKey(message.occurredAt, timeZone);
    const previous = oldestFirst[index - 1];
    if (previous === undefined || dayKey(previous.occurredAt, timeZone) !== day) {
      rows.push(
        <li
          key={`day-${day}`}
          className="flex items-center gap-3 text-caption text-muted-foreground"
          aria-hidden="true"
        >
          <Separator className="flex-1" />
          {formatDay(new Date(message.occurredAt), { timeZone })}
          <Separator className="flex-1" />
        </li>,
      );
    }
    rows.push(<MessageBubble key={message.id} message={message} />);
  });
  return (
    <div className="flex flex-col gap-3">
      <ShowMoreButton pages={messages} label={t("earlier")} />
      <ol className="flex flex-col gap-2" aria-label={t("messages")}>
        {rows.map((row, index) => (
          <Fragment key={index}>{row}</Fragment>
        ))}
      </ol>
    </div>
  );
}

/**
 * `inbox`: beside the list on a computer, with its header; `page`: the phone's page of its own, where the person is the
 * page's title; `lead`: inside the lead's page, which already shows the person, so only the chat.
 */
export type ChatVariant = "inbox" | "page" | "lead";

export function ChatPanel({ conversationId, variant = "inbox" }: { conversationId: string; variant?: ChatVariant }) {
  const t = useTranslations("inbox.chat");
  const header = useConversation(conversationId);
  const mayStartLead = useHolds("leads:create");
  if (header.data === undefined) {
    if (!header.valid || refusalOf(header.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (header.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={header.error}
          retryLabel={t("retry")}
          onRetry={() => void header.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  }
  const data = header.data;
  return (
    <section
      className="flex flex-col gap-4"
      aria-label={t("region", { name: data.name ?? formatPhoneNumber(data.phone) })}
    >
      {variant !== "lead" && <Header header={data} asPageTitle={variant === "page"} />}
      {variant !== "lead" && mayStartLead && data.pastCustomer && <StartLeadButton conversationId={data.id} />}
      <Messages conversationId={data.id} />
      {data.state === "open" && <WindowLine header={data} />}
    </section>
  );
}
