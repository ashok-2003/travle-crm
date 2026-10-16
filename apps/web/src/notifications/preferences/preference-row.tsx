"use client";

// One row of the choices: a kind, or every kind, with its email and push switches. The row is a group named by the
// kind, so each switch reads "Email" or "Push" within it.
import type { NotificationChannel } from "@travel-crm/contracts/notifications";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

const channels: readonly NotificationChannel[] = ["email", "push"];

export function PreferenceRow({
  label,
  hint,
  receives,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  /** Whether this kind reaches the person on each channel. */
  receives: Record<NotificationChannel, boolean>;
  disabled: Record<NotificationChannel, boolean>;
  onChange: (channel: NotificationChannel, receives: boolean) => void;
}) {
  const t = useTranslations("notifications.preferences");
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-hint`}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p id={`${id}-label`} className="font-medium">
          {label}
        </p>
        <p id={`${id}-hint`} className="text-label text-muted-foreground">
          {hint}
        </p>
      </div>
      <div className="flex shrink-0 gap-6">
        {channels.map((channel) => (
          <Field key={channel} orientation="horizontal" data-disabled={disabled[channel]} className="w-auto gap-3">
            <Switch
              id={`${id}-${channel}`}
              checked={receives[channel]}
              disabled={disabled[channel]}
              onCheckedChange={(checked) => {
                onChange(channel, checked);
              }}
            />
            <FieldLabel htmlFor={`${id}-${channel}`}>{t(channel)}</FieldLabel>
          </Field>
        ))}
      </div>
    </div>
  );
}
