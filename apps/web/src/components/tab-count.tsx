// A tab's count (My tasks, Follow-ups): the number in a small red pill, so a tab with work in it catches the eye, on the
// selected tab's dark fill as on the others. Nothing for none: red says something is waiting.
import { formatCount } from "@/lib/format";

export function TabCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="numbers inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-bad-fill px-1.5 text-caption font-medium text-status-bad-ink">
      {formatCount(count)}
    </span>
  );
}
