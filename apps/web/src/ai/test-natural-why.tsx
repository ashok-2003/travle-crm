"use client";

// "Why" under the new agent's answer, for whoever tests it as a developer would: the prompt version (and, when the draft
// was chosen and there was none, that the live prompt ran), how the turn ended (and a fallback's or a restart's reason),
// its calls, time and tokens; then each model call in order with its model, time, tokens and words, and each tool it
// called as name(arguments) → result, a refused one marked; each guard's verdict; the flags; and what it would do, in the
// owner's words. Codes and recorded values show as recorded.
import { naturalPromptLabels, type NaturalTestAnswer, type NaturalTestPrompt } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { Details, type Detail } from "@/components/details";
import { StatusDot } from "@/components/status-badge";
import { formatCount } from "@/lib/format";
import { useActionWords } from "./test-natural-actions";
import { code, Part } from "./test-why";

type Call = NaturalTestAnswer["trace"]["calls"][number];
type Tokens = Pick<Call, "inputTokens" | "cachedTokens" | "outputTokens" | "reasoningTokens">;

const seconds = (ms: number) => (ms / 1000).toFixed(1);
const noTokens: Tokens = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 };
const sumOf = (calls: readonly Call[]): Tokens =>
  calls.reduce(
    (sum, call) => ({
      inputTokens: sum.inputTokens + call.inputTokens,
      cachedTokens: sum.cachedTokens + call.cachedTokens,
      outputTokens: sum.outputTokens + call.outputTokens,
      reasoningTokens: sum.reasoningTokens + call.reasoningTokens,
    }),
    noTokens,
  );

function useTokenWords(): (tokens: Tokens) => string {
  const t = useTranslations("ai.test.natural.why");
  return (tokens) =>
    t("tokenCounts", {
      input: formatCount(tokens.inputTokens),
      cached: formatCount(tokens.cachedTokens),
      output: formatCount(tokens.outputTokens),
      reasoning: formatCount(tokens.reasoningTokens),
    });
}

function CallItem({ call }: { call: Call }) {
  const t = useTranslations("ai.test.natural.why");
  const tokenWords = useTokenWords();
  return (
    <li className="flex flex-col gap-1">
      {call.model === "" ? <span>{t("noModel")}</span> : code(call.model)}
      <span className="text-label">
        {t("callLine", { seconds: seconds(call.ms), tokens: tokenWords(call), finish: call.finishReason })}
      </span>
      {call.words !== null && (
        <span className="whitespace-pre-line wrap-anywhere">{t("wrote", { words: call.words })}</span>
      )}
      {call.tools.length > 0 && (
        <ol className="flex flex-col gap-1">
          {call.tools.map((tool, index) => (
            // A call's tools come in the order the model asked: a tool call's place is its identity.
            <li key={index} className="flex flex-col">
              {code(`${tool.name}(${tool.arguments})`)}
              <span className="text-label wrap-anywhere">
                {tool.refused && <StatusDot tone="attention" className="me-1.5 inline-block align-middle" />}
                {t("result", { result: tool.result })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** `prompt` is the one the turn was asked to run: a draft that wasn't there ran the live prompt, and Why says so. */
export function TestNaturalWhy({ answer, prompt }: { answer: NaturalTestAnswer; prompt: NaturalTestPrompt }) {
  const t = useTranslations("ai.test");
  const actionWords = useActionWords();
  const tokenWords = useTokenWords();
  const { trace, actions } = answer;
  /** A row only when the turn recorded something for it. */
  const recorded = (label: string, value: string | null): Detail[] =>
    value === null ? [] : [{ label, value: code(value) }];
  const noDraft = prompt === "draft" && trace.promptLabel !== naturalPromptLabels.draft;
  return (
    <div className="flex flex-col gap-3">
      <Details
        rows={[
          { label: t("natural.why.prompt"), value: code(trace.promptVersion) },
          ...(noDraft ? [{ label: t("natural.why.draft"), value: t("natural.why.noDraft") }] : []),
          { label: t("natural.why.outcome"), value: t(`natural.outcomes.${answer.outcome}`) },
          ...recorded(t("natural.why.fallback"), trace.fallback),
          ...recorded(t("natural.why.restarted"), trace.restarted),
          { label: t("natural.why.calls"), value: code(formatCount(trace.calls.length)) },
          { label: t("natural.why.time"), value: t("natural.why.seconds", { seconds: seconds(trace.durationMs) }) },
          { label: t("natural.why.tokens"), value: tokenWords(sumOf(trace.calls)) },
        ]}
      />
      <Part title={t("natural.why.eachCall")}>
        <ol className="flex flex-col gap-3">
          {trace.calls.map((call, index) => (
            // Calls come in order and never change: a call's place is its identity.
            <CallItem key={index} call={call} />
          ))}
        </ol>
      </Part>
      <Part title={t("natural.why.guards")}>
        {trace.guards.length === 0 ? (
          <p className="text-muted-foreground">{t("natural.why.noGuards")}</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {trace.guards.map((verdict, index) => (
              // A retried reply's verdicts come after the refused draft's: a verdict's place is its identity.
              <li key={index} className="flex flex-col">
                <span className="flex items-center gap-2">
                  <StatusDot tone={verdict.passed ? "good" : "attention"} />
                  {t(verdict.passed ? "natural.why.guardPassed" : "natural.why.guardRefused", { guard: verdict.guard })}
                </span>
                {verdict.detail !== null && <span className="text-label wrap-anywhere">{verdict.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </Part>
      <Details
        rows={[
          {
            label: t("natural.why.flags"),
            value: trace.flags.length === 0 ? t("why.none") : code(trace.flags.join(", ")),
          },
          {
            label: t("why.wouldDo"),
            value:
              actions.length === 0 ? (
                t("why.nothingMore")
              ) : (
                <span className="flex flex-col gap-1">
                  {actions.map((action, index) => (
                    // Actions come in the order the turn staged them: an action's place is its identity.
                    <span key={index}>{actionWords(action)}</span>
                  ))}
                </span>
              ),
          },
        ]}
      />
    </div>
  );
}
