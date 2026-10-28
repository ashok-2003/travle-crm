"use client";

// A follow-up set with a team note (sales inbox spec, design v2), as the sales inboxes have it: "Follow up tomorrow at
// 11:00" beside the note's box. The choice is a moment on the agency's clock (this evening, tomorrow morning, in two days,
// or a day and time of the member's own, DueField); the note then also makes a follow-up on the chat's lead, for its
// owner, through the lead's own procedure.
import type { WallClockTime } from "@travel-crm/contracts/kernel";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { CalendarClockIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { DueField, suggestedDue } from "@/components/forms/due-field";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatCalendarDay } from "@/lib/format";
import { useMe } from "@/session/me-context";

/** How a chosen follow-up reads in the note and on its button: "27 Oct, 11:00". */
export const followUpWords = ({ on, at }: WallClockTime) => `${formatCalendarDay(on)}, ${at}`;

export function NoteFollowUp({
  value,
  onChange,
  disabled,
}: {
  value: WallClockTime | null;
  onChange: (due: WallClockTime | null) => void;
  disabled: boolean;
}) {
  const t = useTranslations("inbox.chat.followUp");
  const { timeZone } = useMe().organization;
  const [open, setOpen] = useState(false);
  const form = useForm({ defaultValues: suggestedDue(timeZone) });
  const today = calendarDateIn(new Date(), timeZone);
  const choose = (on: string, at: string) => {
    onChange({ on, at });
    setOpen(false);
  };
  const presets = [
    { key: "evening", on: today, at: "18:00" },
    { key: "tomorrow", on: addDays(today, 1), at: "11:00" },
    { key: "inTwoDays", on: addDays(today, 2), at: "11:00" },
  ] as const;
  if (value !== null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-attention-fill pl-3 text-label text-status-attention-ink">
        <CalendarClockIcon aria-hidden="true" className="size-4" />
        {t("set", { when: followUpWords(value) })}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-status-attention-ink"
          aria-label={t("remove")}
          disabled={disabled}
          onClick={() => {
            onChange(null);
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" className="gap-1.5 px-2.5 text-muted-foreground" disabled={disabled}>
          <CalendarClockIcon aria-hidden="true" />
          {t("add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3">
        <p className="text-label font-medium">{t("title")}</p>
        <div className="flex flex-col gap-1">
          {presets.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant="quiet"
              className="justify-between"
              onClick={() => {
                choose(preset.on, preset.at);
              }}
            >
              {t(`presets.${preset.key}`)}
              <span className="text-caption text-muted-foreground">
                {followUpWords({ on: preset.on, at: preset.at })}
              </span>
            </Button>
          ))}
        </div>
        <Separator />
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            // The popover is a portal, but React passes its events up to the note's form: stop here.
            event.stopPropagation();
            void form.handleSubmit((values) => {
              choose(values.day, values.time);
            })(event);
          }}
        >
          <DueField control={form.control} dayName="day" timeName="time" label={t("pick")} />
          <Button type="submit">{t("choose")}</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
