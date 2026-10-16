"use client";

// Narrows the failed jobs to one queue, by its name ("documents.render-pdf", checked by the api's own schema before
// it is asked for), and back to every queue.
import { queueName } from "@travel-crm/contracts/platform";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function QueueFilter({ queue, onChange }: { queue: string | null; onChange: (queue: string | null) => void }) {
  const t = useTranslations("consolePlatform.jobs");
  const id = useId();
  const [text, setText] = useState(queue ?? "");
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <form
        noValidate
        className="flex flex-wrap items-start gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = queueName.safeParse(text.trim());
          setInvalid(!parsed.success);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        <Field data-invalid={invalid} className="max-w-sm flex-1">
          <FieldLabel htmlFor={id}>{t("queue")}</FieldLabel>
          <Input
            id={id}
            value={text}
            className="numbers"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : `${id}-hint`}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
          {invalid ? (
            <FieldError id={`${id}-error`} className="flex items-start gap-1.5">
              <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("queueInvalid")}
            </FieldError>
          ) : (
            <FieldDescription id={`${id}-hint`}>{t("queueHint")}</FieldDescription>
          )}
        </Field>
        <Button type="submit" variant="outline" className="sm:mt-7">
          {t("filter")}
        </Button>
      </form>
      {queue !== null && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>{t("showingQueue", { queue })}</span>
          <Button
            variant="ghost"
            onClick={() => {
              setText("");
              onChange(null);
            }}
          >
            {t("allQueues")}
          </Button>
        </p>
      )}
    </div>
  );
}
