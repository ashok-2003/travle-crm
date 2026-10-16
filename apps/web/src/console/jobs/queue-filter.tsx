"use client";

// Narrows the failed jobs to one queue, by its name ("documents.render-pdf", checked by the api's own schema before
// it is asked for), and back to every queue.
import { queueName } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

export function QueueFilter({ queue, onChange }: { queue: string | null; onChange: (queue: string | null) => void }) {
  const t = useTranslations("consolePlatform.jobs");
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
        <FormField
          label={t("queue")}
          hint={t("queueHint")}
          error={invalid ? t("queueInvalid") : undefined}
          className="max-w-sm flex-1"
        >
          {(links) => (
            <InputGroup>
              <InputGroupInput
                {...links}
                value={text}
                className="numbers"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setText(event.target.value);
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit" variant="outline">
                  {t("filter")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          )}
        </FormField>
      </form>
      {queue !== null && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>{t("showingQueue", { queue })}</span>
          <Button
            variant="link"
            className="px-0"
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
