"use client";

// "Fill it for me" (release ai2a): say it with the mic, type it, paste a chat, or show a screenshot; the AI proposes values for
// the form, and the person ticks what to take. Fields the form has empty start ticked; fields that already hold a value start
// unticked and show before and after, with the words each came from. Apply copies the ticked values into the open form, unsaved:
// nothing is sent to the server by Apply. One fill is one of the agency's monthly AI calls, given back when the AI doesn't answer.
import type { AiFillProposal, FillPath, FillTarget } from "@travel-crm/contracts/ai";
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import type { ReturnFocusTo } from "@/components/return-focus";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { FillSourceFields } from "./fill-source-fields";
import { useFillText } from "./fill-text";
import { useFill } from "./use-ai-fill";
import { useFillSource } from "./use-fill-source";

const groupOf = (path: FillPath) => (path.startsWith("call.") ? "call" : "rest");
const pathKey = (path: FillPath) => path.replace(".", "_");

export function AiFillSheet({
  target,
  subjectId,
  open,
  onOpenChange,
  current,
  onApply,
  chatId,
  returnFocusTo,
}: {
  target: FillTarget;
  subjectId?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the form holds now, to show beside what the AI found and to start filled fields unticked. */
  current: Partial<Record<FillPath, unknown>>;
  onApply: (proposal: AiFillProposal, ticked: FillPath[]) => void;
  /** A chat to read at once (Make a lead from this chat): no typing needed. */
  chatId?: string | undefined;
  returnFocusTo?: ReturnFocusTo | undefined;
}) {
  const t = useTranslations("ai.fill.sheet");
  const paths = useTranslations("ai.fill.paths");
  const sources = useTranslations("ai.fill.sources");
  const days = useTranslations("ai.fill.draft");
  const textOf = useFillText();
  const fill = useFill(target);
  const source = useFillSource();
  const drafting = target === "quote_days";
  const [problem, setProblem] = useState<unknown>(null);
  const [proposal, setProposal] = useState<AiFillProposal | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<FillPath>>(new Set());
  const busy = source.busy || fill.isPending;

  const show = (next: AiFillProposal) => {
    setProposal(next);
    // What the form has empty is taken unless unticked; what it already holds is left unless ticked.
    setTicked(new Set(next.fields.filter((field) => current[field.path] === undefined).map((field) => field.path)));
  };

  async function run(from: "chat" | "input") {
    setProblem(null);
    try {
      const input =
        from === "chat" && chatId !== undefined
          ? { kind: "chat" as const, conversationId: chatId }
          : await source.build();
      show(await fill.mutateAsync({ target, ...(subjectId === undefined ? {} : { subjectId }), source: input }));
    } catch (error) {
      setProblem(error);
    }
  }

  const started = useRef(false);
  // Closed, the sheet forgets: the next opening starts with nothing said.
  const changeOpen = (next: boolean) => {
    if (!next) {
      source.reset();
      setProposal(null);
      setProblem(null);
      started.current = false;
    }
    onOpenChange(next);
  };

  // "Make a lead from this chat" reads the chat as soon as the sheet opens.
  useEffect(() => {
    if (open && chatId !== undefined && !started.current) {
      started.current = true;
      void run("chat");
    }
  });

  const fields = proposal?.fields ?? [];
  const groups = new Set(fields.map((field) => groupOf(field.path)));
  const rows = (group: string) => fields.filter((field) => groupOf(field.path) === group);

  // "Draft the days" needs no words: it writes from what the system knows.
  const ready = drafting || source.ready;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      busy={busy}
      returnFocusTo={returnFocusTo}
      title={drafting ? days("title") : t("title")}
      description={proposal === null ? (drafting ? days("description") : t("description")) : t("reviewDescription")}
      footer={
        proposal === null ? (
          chatId === undefined && (
            <Button
              disabled={!ready || busy || source.recorder.recording}
              onClick={() => {
                void run("input");
              }}
            >
              {busy && <Spinner />}
              {busy ? (drafting ? days("working") : t("reading")) : drafting ? days("fill") : t("fill")}
            </Button>
          )
        ) : (
          <>
            {chatId === undefined && (
              <Button
                variant="outline"
                onClick={() => {
                  setProposal(null);
                }}
              >
                {t("back")}
              </Button>
            )}
            <Button
              disabled={ticked.size === 0}
              onClick={() => {
                onApply(proposal, [...ticked]);
                changeOpen(false);
              }}
            >
              {t("apply", { count: ticked.size })}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {proposal === null ? (
          chatId !== undefined ? (
            <p role="status" className="flex items-center gap-2 text-muted-foreground">
              {busy && <Spinner />}
              {t("readingChat")}
            </p>
          ) : (
            <>
              <FillSourceFields
                source={source}
                busy={busy}
                allowImage={!drafting}
                textLabel={drafting ? days("textLabel") : t("textLabel")}
                textHint={drafting ? days("textHint") : t("textHint")}
              />
            </>
          )
        ) : (
          <>
            {proposal.truncated && <p className="text-muted-foreground">{t("truncated")}</p>}
            {proposal.removedAmounts && (
              <Alert>
                <InfoIcon aria-hidden="true" />
                <AlertDescription>{days("removedAmounts")}</AlertDescription>
              </Alert>
            )}
            {proposal.questions.length > 0 && (
              <Alert>
                <AlertTitle>{t("questions")}</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {proposal.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {fields.length === 0 && <p>{t("nothingYet")}</p>}
            {[...groups].sort().map((group) => (
              <FieldSet key={group}>
                {groups.size > 1 && <FieldLegend variant="label">{t(`groups.${group as "call"}`)}</FieldLegend>}
                {rows(group).map((field) => {
                  const old = current[field.path];
                  const id = `fill-${field.path}`;
                  return (
                    <Field key={field.path} orientation="horizontal" className="min-h-11">
                      <Checkbox
                        id={id}
                        checked={ticked.has(field.path)}
                        onCheckedChange={(on) => {
                          setTicked((before) => {
                            const next = new Set(before);
                            if (on === true) next.add(field.path);
                            else next.delete(field.path);
                            return next;
                          });
                        }}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={id} className="font-normal">
                          <span className="font-medium">
                            {field.path === "quote.days" && old !== undefined
                              ? days("replace")
                              : paths(pathKey(field.path) as "person_name")}
                          </span>
                          <span className="text-people-tint-ink">{textOf(field.path, field.value)}</span>
                        </FieldLabel>
                        {field.path === "quote.days" && (
                          <ol className="list-decimal pl-5 text-people-tint-ink">
                            {(field.value as { title: string }[]).map((day, index) => (
                              <li key={`${String(index)}-${day.title}`}>{day.title}</li>
                            ))}
                          </ol>
                        )}
                        <FieldDescription>
                          {old !== undefined && <span>{t("now", { value: textOf(field.path, old) })} </span>}
                          {field.excerpt !== "" && (
                            <span>{t("from", { source: sources(field.from), words: field.excerpt })}</span>
                          )}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldSet>
            ))}
          </>
        )}
        <RefusalAlert error={problem} />
      </div>
    </ResponsiveDialog>
  );
}
