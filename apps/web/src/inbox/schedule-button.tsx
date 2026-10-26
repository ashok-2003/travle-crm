"use client";

// Send later (sales inbox spec 6): the clock beside Send opens the choices for the words in the box: in an hour, this
// evening at 6, tomorrow at 10 (those inside the 24-hour window only), or a day and a time of the member's choosing on the
// agency's clock (DueField; one past the window is refused with the reason); the words then wait in the chat's scheduled
// list. Off while the box is empty.
import { addDays, calendarDateIn, instantAt, type CalendarDate, type TimeOfDay } from "@travel-crm/domain/kernel";
import { CalendarClockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DueField, suggestedDue } from "@/components/forms/due-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useSchedule } from "./use-sales-inbox";

const at = (day: string, time: string, timeZone: string) => instantAt(day as CalendarDate, time as TimeOfDay, timeZone);

export function ScheduleButton({
  conversationId,
  windowOpenUntil,
  text,
  disabled,
  onScheduled,
}: {
  conversationId: string;
  /** When the 24-hour window closes: free text can't be scheduled for that moment or later. */
  windowOpenUntil: string;
  text: string;
  disabled: boolean;
  onScheduled: () => void;
}) {
  const t = useTranslations("inbox.chat.scheduled");
  const { timeZone } = useMe().organization;
  const { schedule } = useSchedule();
  const [open, setOpen] = useState(false);
  const form = useForm({ defaultValues: suggestedDue(timeZone) });
  const now = new Date();
  const today = calendarDateIn(now, timeZone);
  const choices = [
    { key: "inHour", at: new Date(now.getTime() + 3_600_000) },
    { key: "evening", at: at(today, "18:00", timeZone) },
    { key: "tomorrow", at: at(addDays(today, 1), "10:00", timeZone) },
  ] as const;
  const windowEnd = new Date(windowOpenUntil).getTime();
  const shown = choices.filter(
    (choice) => choice.at.getTime() > now.getTime() + 60_000 && choice.at.getTime() < windowEnd,
  );
  const send = (when: Date) => {
    schedule.mutate(
      { conversationId, body: text, sendAt: when.toISOString() },
      {
        onSuccess: () => {
          toast.success(t("done", { when: formatDayTime(when, { timeZone }) }));
          setOpen(false);
          onScheduled();
        },
      },
    );
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!schedule.isPending) setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={t("open")}
          disabled={disabled}
        >
          <CalendarClockIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <p className="text-label font-medium">{t("title")}</p>
        <div className="flex flex-col gap-1">
          {shown.map((choice) => (
            <Button
              key={choice.key}
              type="button"
              variant="quiet"
              className="justify-between"
              disabled={schedule.isPending}
              onClick={() => {
                send(choice.at);
              }}
            >
              {t(`choices.${choice.key}`)}
              <span className="text-caption text-muted-foreground">{formatDayTime(choice.at, { timeZone })}</span>
            </Button>
          ))}
        </div>
        <Separator />
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            // The popover is a portal, but React still passes its events up to the reply box's form: stop here.
            event.stopPropagation();
            void form.handleSubmit((values) => {
              send(at(values.day, values.time, timeZone));
            })(event);
          }}
        >
          <DueField control={form.control} dayName="day" timeName="time" label={t("pick")} />
          <Button type="submit" disabled={schedule.isPending}>
            {t("schedule")}
          </Button>
        </form>
        <RefusalAlert error={schedule.error} />
      </PopoverContent>
    </Popover>
  );
}
