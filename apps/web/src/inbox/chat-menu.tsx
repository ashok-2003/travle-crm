"use client";

// A chat's menu (sales inbox spec, sections 5 and 6), for whoever may reply: Mark as answered while it waits, Snooze (in an
// hour, in three, tomorrow at 10, next Monday at 10, in the agency's own time zone) or Wake it now, Pin and Archive. A
// refusal says why in a toast.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckCheckIcon,
  EllipsisVerticalIcon,
  PanelRightIcon,
  PhoneIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useErrorMessage } from "@/lib/error-message";
import { formatDayTime, formatPhoneNumber } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useArchive, useMarkAnswered, usePin } from "./use-inbox-tools";
import { useSnooze } from "./use-sales-inbox";

/** The moment it is `hour`:00 in the zone on the day `daysAhead` from today there. */
function atHourInZone(timeZone: string, hour: number, daysAhead: number): Date {
  const now = new Date();
  // The zone's offset now, from how the zone writes this moment.
  const zoned = new Date(now.toLocaleString("en-US", { timeZone }));
  const offset = zoned.getTime() - now.getTime();
  const target = new Date(zoned);
  target.setDate(target.getDate() + daysAhead);
  target.setHours(hour, 0, 0, 0);
  return new Date(target.getTime() - offset);
}

function snoozeChoices(timeZone: string) {
  const now = new Date();
  const zonedDay = new Date(now.toLocaleString("en-US", { timeZone })).getDay();
  // Days to the next Monday: a whole week on a Monday itself.
  const toMonday = (1 - zonedDay + 7) % 7 || 7;
  return [
    { key: "inHour", until: new Date(now.getTime() + 3_600_000) },
    { key: "inThreeHours", until: new Date(now.getTime() + 3 * 3_600_000) },
    { key: "tomorrow", until: atHourInZone(timeZone, 10, 1) },
    { key: "nextWeek", until: atHourInZone(timeZone, 10, toMonday) },
  ] as const;
}

export function ChatMenu({
  header,
  onToggleSearch,
  onTogglePanel,
}: {
  header: ConversationHeader;
  /** On a phone the bar has no room for these, so the menu holds them. */
  onToggleSearch: () => void;
  onTogglePanel: () => void;
}) {
  const t = useTranslations("inbox.chat");
  const { apiError } = useErrorMessage();
  const { timeZone } = useMe().organization;
  const mayReply = useHolds("inbox:reply");
  const access = useWriteAccess("change");
  const pin = usePin();
  const archive = useArchive();
  const answered = useMarkAnswered();
  const snooze = useSnooze();
  const acts = mayReply && header.state === "open";
  const name = header.name ?? formatPhoneNumber(header.phone);
  const failed = { onError: (error: unknown) => toast.error(apiError(error)) };
  const off = !access.allowed;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("menu")}
          className={acts ? undefined : "md:hidden"}
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* What the bar shows on a wider screen, here on a phone, where the bar keeps the name in full. */}
        <DropdownMenuItem className="md:hidden" onSelect={onToggleSearch}>
          <SearchIcon aria-hidden="true" />
          {t("search")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="md:hidden">
          <a href={`tel:${header.phone}`}>
            <PhoneIcon aria-hidden="true" />
            {t("call", { name })}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem className="md:hidden" onSelect={onTogglePanel}>
          <PanelRightIcon aria-hidden="true" />
          {t("contactPanel")}
        </DropdownMenuItem>
        {acts && <DropdownMenuSeparator className="md:hidden" />}
        {acts && (
          <>
            {header.needsReply && (
              <DropdownMenuItem
                disabled={off || answered.isPending}
                onSelect={() => {
                  answered.mutate({ conversationId: header.id }, failed);
                }}
              >
                <CheckCheckIcon aria-hidden="true" />
                {t("markAnswered")}
              </DropdownMenuItem>
            )}
            {header.snoozedUntil === null ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={off}>
                  <AlarmClockIcon aria-hidden="true" />
                  {t("snooze")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {snoozeChoices(timeZone).map((choice) => (
                    <DropdownMenuItem
                      key={choice.key}
                      disabled={snooze.isPending}
                      onSelect={() => {
                        snooze.mutate(
                          { conversationId: header.id, until: choice.until.toISOString() },
                          {
                            ...failed,
                            onSuccess: () => {
                              toast.success(t("snoozedUntil", { when: formatDayTime(choice.until, { timeZone }) }));
                            },
                          },
                        );
                      }}
                    >
                      {t(`snoozeChoices.${choice.key}`)}
                      <span className="ml-auto pl-4 text-caption text-muted-foreground">
                        {formatDayTime(choice.until, { timeZone })}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem
                disabled={off || snooze.isPending}
                onSelect={() => {
                  snooze.mutate({ conversationId: header.id, until: null }, failed);
                }}
              >
                <AlarmClockOffIcon aria-hidden="true" />
                {t("wake")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={off || pin.isPending}
              onSelect={() => {
                pin.mutate({ conversationId: header.id, on: !header.pinned }, failed);
              }}
            >
              {header.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
              {header.pinned ? t("unpin") : t("pin")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={off || archive.isPending}
              onSelect={() => {
                archive.mutate({ conversationId: header.id, on: !header.archived }, failed);
              }}
            >
              {header.archived ? <ArchiveRestoreIcon aria-hidden="true" /> : <ArchiveIcon aria-hidden="true" />}
              {header.archived ? t("unarchive") : t("archive")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
