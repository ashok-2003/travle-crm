// A count of work waiting, on a tab (My tasks, Follow-ups) or a sidebar destination: the number in a small pill, red
// so it catches the eye (on the selected tab's dark fill as on the others), or the people violet for unread chats
// (DESIGN.md Navigation). Nothing for none: a pill says something is waiting.
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const tones = {
  waiting: "bg-status-bad-fill text-status-bad-ink",
  people: "bg-people-tint text-people-tint-ink",
} as const;

export function TabCount({ count, tone = "waiting" }: { count: number; tone?: keyof typeof tones }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "numbers inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-medium",
        tones[tone],
      )}
    >
      {formatCount(count)}
    </span>
  );
}
