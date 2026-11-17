"use client";

// Setup step "Custom instructions": the owner's own rules on how the agent talks ("Don't use emojis"), added one at a
// time, each changed or removed from its row. The list scrolls inside a fixed height, so the page never grows with it.
import { AGENT_INSTRUCTION_LENGTH, AGENT_INSTRUCTIONS_MAX, type AgentInstruction } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Item, ItemGroup, ItemSeparator } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { InstructionRow } from "./instruction-row";
import { useAddInstruction, useAgentInstructions } from "./use-setup-steps";

/** Rows shown before the list scrolls inside its own window. */
const ROWS_BEFORE_SCROLL = 4;
const IDEAS = ["noEmojis", "human", "noRepeat", "answerFirst"] as const;

function Instructions({ saved }: { saved: AgentInstruction[] }) {
  const t = useTranslations("aiAgent.setup.instructions");
  const hintId = `${useId()}-write`;
  const access = useWriteAccess("change");
  const [typed, setTyped] = useState("");
  const add = useAddInstruction(() => {
    setTyped("");
    toast.success(t("added"));
  });
  const full = saved.length >= AGENT_INSTRUCTIONS_MAX;
  const canAdd = access.allowed && !full && !add.isPending;
  const described = access.allowed ? undefined : hintId;
  const kept = new Set(saved.map((one) => one.text.trim()));
  const ideas = IDEAS.map((key) => t(`idea.${key}`)).filter((text) => !kept.has(text));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">{t("intro")}</p>
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim() !== "") add.mutate({ text: typed.trim() });
        }}
      >
        <FormField label={t("new")} hint={t("hint", { max: AGENT_INSTRUCTION_LENGTH })}>
          {(links) => (
            <Textarea
              {...links}
              rows={2}
              maxLength={AGENT_INSTRUCTION_LENGTH}
              value={typed}
              disabled={!canAdd}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          )}
        </FormField>
        <RefusalAlert error={add.error} />
        <div>
          <Button type="submit" disabled={!canAdd || typed.trim() === ""} aria-describedby={described}>
            {add.isPending ? t("adding") : t("add")}
          </Button>
          <WriteHint id={hintId} hint={access.hint} />
        </div>
      </form>
      {ideas.length > 0 && !full && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{t("ideas")}</p>
          <div className="flex flex-wrap gap-2">
            {ideas.map((text) => (
              <Button
                key={text}
                type="button"
                variant="outline"
                className="h-auto min-h-11 whitespace-normal text-left"
                aria-label={t("addIdea", { text })}
                aria-describedby={described}
                disabled={!canAdd}
                onClick={() => {
                  add.mutate({ text });
                }}
              >
                {text}
              </Button>
            ))}
          </div>
        </div>
      )}
      <p className="text-muted-foreground" aria-live="polite">
        {full
          ? t("full", { max: AGENT_INSTRUCTIONS_MAX })
          : t("count", { count: saved.length, max: AGENT_INSTRUCTIONS_MAX })}
      </p>
      {saved.length === 0 ? (
        <p>{t("none")}</p>
      ) : (
        <ScrollArea className={saved.length > ROWS_BEFORE_SCROLL ? "h-80" : undefined}>
          <ItemGroup aria-label={t("listLabel")}>
            {saved.map((instruction, index) => (
              <div key={instruction.id}>
                {index > 0 && <ItemSeparator />}
                <Item>
                  <InstructionRow
                    instruction={instruction}
                    number={index + 1}
                    writable={access.allowed}
                    describedBy={described}
                  />
                </Item>
              </div>
            ))}
          </ItemGroup>
        </ScrollArea>
      )}
    </div>
  );
}

export function InstructionsStepEditor() {
  const t = useTranslations("aiAgent.setup.instructions");
  const instructions = useAgentInstructions();
  if (instructions.data !== undefined) return <Instructions saved={instructions.data} />;
  return instructions.isError ? (
    <LoadFailedAlert message={t("loadFailed")} error={instructions.error} onRetry={() => void instructions.refetch()} />
  ) : (
    <LoadingRows shape="twoLines" label={t("loading")} />
  );
}
