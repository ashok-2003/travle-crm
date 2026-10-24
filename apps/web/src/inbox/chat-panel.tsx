"use client";

// One chat (spec 3.2), on the inbox's right, on a phone's page of its own and in the lead's WhatsApp section: the person
// (a link to their lead), the messages oldest at the bottom, a page at a time upward, a day line between days, and under
// them the reply box (or why there is none). The messages refetch while it is open.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageTitle } from "@/components/page-title";
import { TextLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { formatPhoneNumber } from "@/lib/format";
import { leadRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { MessageList } from "./message-list";
import { ReplyArea } from "./reply-area";
import { StartLeadButton } from "./start-lead-button";
import { useConversation } from "./use-inbox";

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
      {header.optedOut && <p className="text-label text-status-bad-ink">{t("optedOut")}</p>}
    </div>
  );
}

/**
 * `inbox`: beside the list on a computer, with its header; `page`: the phone's page of its own, where the person is the
 * page's title; `lead`: inside the lead's page, which already shows the person, so only the chat.
 */
export type ChatVariant = "inbox" | "page" | "lead";

/** The chat's height: beside the list on a computer, on a phone's page (under its title and above the bottom bar), on a lead's card. */
const boxHeight: Record<ChatVariant, string> = {
  inbox: "h-[max(28rem,calc(100dvh-14rem))]",
  page: "h-[max(24rem,calc(100dvh-20rem))]",
  lead: "h-[28rem]",
};

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
      {/* A chat has a height of its own: the messages scroll inside it and the reply box stays at the bottom. */}
      <div className={cn("flex flex-col gap-3", boxHeight[variant])}>
        <div className="relative min-h-0 flex-1">
          <MessageList conversationId={data.id} />
        </div>
        <div className="shrink-0">
          <ReplyArea header={data} />
        </div>
      </div>
    </section>
  );
}
