"use client";

// Blocked contacts in Settings (spec 3.6, R33): the phones, emails and Instagram handles blocked from leads, newest
// first, a page at a time, each as people read it (+91 98765 43210, @handle), with who blocked it and on what day in
// the agency's zone, and Unblock. For leads:assign; the way back is to Settings for those who may open it, and to Leads,
// whose link brought them, for those who may not.
import type { BlockedContact } from "@travel-crm/contracts/crm";
import { BanIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { BackToSettings } from "@/components/back-to-settings";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { ShowMoreButton } from "@/components/show-more-button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { formatDay, formatPhoneNumber } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useHolds, useMe } from "@/session/me-context";
import { UnblockContact } from "./unblock-contact";

/** A blocked contact, with the name of who blocked it (null: no longer a member). */
type ListedContact = BlockedContact & { blockedByName: string | null };

function useBlockedContacts() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.blockedContacts.list.pathKey(), {}],
    page: (cursor) => client.blockedContacts.list.query(cursor === null ? {} : { before: cursor }),
    items: (page): ListedContact[] =>
      page.items.map((item) => ({
        ...item,
        blockedByName: item.blockedBy === null ? null : (page.people[item.blockedBy] ?? null),
      })),
  });
}

/** The contact as people read it: a phone grouped, a handle with its "@", an email as it is. */
function shownValue({ kind, value }: BlockedContact): string {
  if (kind === "phone") return formatPhoneNumber(value);
  return kind === "instagram" ? `@${value}` : value;
}

function BlockedContactRow({ contact }: { contact: ListedContact }) {
  const t = useTranslations("settings.blockedContacts");
  const tLeads = useTranslations("leads");
  const { timeZone } = useMe().organization;
  const shown = shownValue(contact);
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <span className={contact.kind === "phone" ? "numbers" : "break-all"}>{shown}</span>
          <span className="text-label font-normal text-muted-foreground">{t(`kinds.${contact.kind}`)}</span>
        </ItemTitle>
        <ItemDescription>
          {t("blockedBy", {
            name: contact.blockedByName ?? tLeads("formerMember"),
            day: formatDay(new Date(contact.blockedAt), { timeZone }),
          })}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <UnblockContact contactId={contact.id} shown={shown} />
      </ItemActions>
    </Item>
  );
}

export function BlockedContactsScreen() {
  const t = useTranslations("settings.blockedContacts");
  const tCommon = useTranslations("common");
  const tLeads = useTranslations("leads.list");
  const opensSettings = useHolds("settings:manage");
  const blocked = useBlockedContacts();

  const body = () => {
    if (blocked.items) {
      if (blocked.items.length === 0) return <EmptyState icon={BanIcon} message={t("empty")} />;
      return (
        <div className="flex flex-col gap-4">
          <ItemGroup aria-label={t("listLabel")}>
            {blocked.items.map((contact, index) => (
              <Fragment key={contact.id}>
                {index > 0 && <ItemSeparator />}
                <BlockedContactRow contact={contact} />
              </Fragment>
            ))}
          </ItemGroup>
          <ShowMoreButton pages={blocked} label={t("more")} />
        </div>
      );
    }
    if (blocked.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={blocked.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void blocked.refetch()}
        />
      );
    }
    return <LoadingRows rows={3} shape="twoLines" />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      {opensSettings ? <BackToSettings /> : <BackLink href={routes.leads} label={tLeads("title")} />}
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
