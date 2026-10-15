// The bell's unread count: white on the People violet (DESIGN.md: unread counts, 6.26:1), mono, and capped so it
// stays small; the bell's own label says the whole number, so this is hidden from screen readers.
import { useTranslations } from "next-intl";
import { formatCount } from "@/lib/format";

/** Past this the badge says "99+". */
const MOST_SHOWN = 99;

export function UnreadCount({ count }: { count: number }) {
  const t = useTranslations("notifications.bell");
  return (
    <span
      aria-hidden="true"
      className="numbers absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-people px-1 text-caption font-medium text-on-action"
    >
      {count > MOST_SHOWN ? t("manyUnread") : formatCount(count)}
    </span>
  );
}
