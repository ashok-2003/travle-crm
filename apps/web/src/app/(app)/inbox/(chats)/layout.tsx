// /inbox and /inbox/<id> (inbox revamp spec, part 1 item 1): one layout around both, so the chat list is built once and
// keeps its scroll, search and filters while chats are chosen; only the chat beside it (or over it, on a phone) changes.
// /inbox/broadcasts is outside this group and keeps its own pages.
import type { ReactNode } from "react";
import { InboxScreen } from "@/inbox/inbox-screen";
import { RequirePermission } from "@/session/require-permission";

export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <RequirePermission permission="inbox:view">
      <InboxScreen>{children}</InboxScreen>
    </RequirePermission>
  );
}
