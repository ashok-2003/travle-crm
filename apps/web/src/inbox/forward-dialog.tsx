"use client";

// Forward a message's words to another chat (sales inbox spec, design v2): find the chat by a name or digits of its phone,
// choose it, and the words wait in that chat's reply box, to read over and send there (inside its own 24-hour window).
// Nothing is sent from here. The words wait in the tab, never the address, and go once the chat's box has taken them.
import { SearchXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { SearchField } from "@/leads/list/search-field";
import { formatPhoneNumber } from "@/lib/format";
import { inboxRoute } from "@/lib/routes";
import { keepTabValue } from "@/lib/tab-storage";
import { ChatAvatar } from "./chat-avatar";
import { useConversations } from "./use-inbox";
import { useForward } from "./use-sales-inbox";

/** Where a chat's reply box finds words forwarded to it. */
export const draftKey = (conversationId: string) => `inbox.draft.${conversationId}`;

export function ForwardDialog({
  messageId,
  words,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  messageId: string;
  words: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("inbox.chat.forward");
  const router = useRouter();
  const [search, setSearchText] = useState("");
  const setSearch = useCallback((text: string) => {
    setSearchText(text);
  }, []);
  const chats = useConversations({
    filter: "all",
    search: search.length >= 2 ? search : "",
    tagId: null,
    stage: null,
    period: null,
  });
  const forward = useForward();
  // The audit entry is written first; only then do the words move to the other chat's box.
  const choose = (conversationId: string) => {
    forward.mutate(
      { messageId, toConversationId: conversationId },
      {
        onSuccess: () => {
          keepTabValue(draftKey(conversationId), words);
          onOpenChange(false);
          router.push(inboxRoute(conversationId));
        },
      },
    );
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
      busy={forward.isPending}
    >
      <div className="flex flex-col gap-3">
        <SearchField
          initial=""
          onSearch={setSearch}
          label={t("search")}
          placeholder={t("searchPlaceholder")}
          className="md:w-full"
        />
        <RefusalAlert error={forward.error} />
        {chats.items === undefined ? (
          <LoadingRows shape="twoLines" label={t("loading")} />
        ) : chats.items.length === 0 ? (
          <EmptyState icon={SearchXIcon} message={t("none")} />
        ) : (
          <ItemGroup aria-label={t("chats")} className="gap-0">
            {chats.items.slice(0, 12).map((chat) => (
              <Item key={chat.id} asChild size="sm" className="rounded-lg hover:bg-surface">
                <button
                  type="button"
                  disabled={forward.isPending}
                  onClick={() => {
                    choose(chat.id);
                  }}
                >
                  <ItemMedia>
                    <ChatAvatar name={chat.name} seed={chat.id} />
                  </ItemMedia>
                  <ItemContent className="min-w-0 text-left">
                    <ItemTitle className="truncate">{chat.name ?? formatPhoneNumber(chat.phone)}</ItemTitle>
                    <ItemDescription className="numbers">{formatPhoneNumber(chat.phone)}</ItemDescription>
                  </ItemContent>
                </button>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
    </ResponsiveDialog>
  );
}
