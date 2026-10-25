"use client";

// How long a customer has waited for a reply (sales inbox spec 6, beyond WhatsApp): "12m", "2h 5m", "3d", ticking each
// minute; amber once half the reply target has gone, red once it has passed (a status: the chat is late).
import { REPLY_TARGET_MINUTES } from "@travel-crm/contracts/inbox";
import { TimerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { statusToneClasses } from "@/components/status-badge";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/** "12m", "2h 5m", "3d": short, as a chat app's times are. */
export function waitedFor(minutes: number): string {
  if (minutes < 60) return `${String(Math.max(1, minutes))}m`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rest)}m`;
  }
  return `${String(Math.floor(minutes / (24 * 60)))}d`;
}

export function WaitTimer({ since, className }: { since: string; className?: string }) {
  const t = useTranslations("inbox");
  const now = useNow();
  const minutes = Math.floor((now.getTime() - new Date(since).getTime()) / 60_000);
  const tone = minutes >= REPLY_TARGET_MINUTES ? "bad" : minutes >= REPLY_TARGET_MINUTES / 2 ? "attention" : "neutral";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-badge px-1.5 text-caption font-medium whitespace-nowrap",
        statusToneClasses[tone].badge,
        className,
      )}
      title={t("waitingFor", { time: waitedFor(minutes) })}
    >
      <TimerIcon aria-hidden="true" className="size-3" />
      <span className="sr-only">{t("waitingFor", { time: waitedFor(minutes) })}</span>
      <span aria-hidden="true">{waitedFor(minutes)}</span>
    </span>
  );
}
