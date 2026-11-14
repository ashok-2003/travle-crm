// "Why" under a Try it answer, for whoever tests the agent as a developer would: what Understand read, the move code chose
// and why, the lookups that ran, each Write try with its refusal, a hand-over's reason, and what the live turn would have
// done next. Codes and recorded values show as recorded.
import type { TestAiAnswer } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Details, type Detail } from "@/components/details";

const code = (text: string) => <span className="numbers wrap-anywhere">{text}</span>;

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}

export function TestWhy({ answer }: { answer: TestAiAnswer }) {
  const t = useTranslations("ai.test");
  const { trace, dryRun } = answer;
  const codes = (list: readonly string[]) => (list.length === 0 ? t("why.none") : code(list.join(", ")));
  /** A row only when the turn recorded something for it. */
  const recorded = (label: string, value: string | null): Detail[] =>
    value === null ? [] : [{ label, value: code(value) }];
  const dropped = trace.checks.filter((check) => !check.passed).map((check) => check.detail ?? check.name);
  return (
    <div className="flex flex-col gap-3">
      <Details
        rows={[
          { label: t("why.intents"), value: codes(trace.intents) },
          ...recorded(t("why.move"), trace.move),
          ...recorded(t("why.reason"), trace.why),
          ...recorded(t("why.stage"), trace.stage),
          ...recorded(t("why.handOver"), trace.handOver),
          ...(dropped.length === 0 ? [] : [{ label: t("why.dropped"), value: codes(dropped) }]),
          {
            label: t("why.wouldDo"),
            value:
              dryRun.actions.length === 0 ? (
                t("why.nothingMore")
              ) : (
                <span className="flex flex-col">
                  {dryRun.actions.map((action) => (
                    <span key={action}>{t(`actions.${action}`)}</span>
                  ))}
                </span>
              ),
          },
        ]}
      />
      <Part title={t("why.lookups")}>
        {trace.lookups.length === 0 ? (
          <p className="text-muted-foreground">{t("why.noLookups")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {trace.lookups.map(({ request, result }, index) => {
              const { tool, ...asked } = request;
              return (
                // The same tool may run twice in a turn: its place in the list is its identity.
                <li key={index} className="flex flex-col">
                  {code(tool)}
                  <span className="text-label wrap-anywhere">{t("why.asked", { json: JSON.stringify(asked) })}</span>
                  <span className="text-label wrap-anywhere">{t("why.got", { json: JSON.stringify(result) })}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Part>
      <Part title={t("why.writes")}>
        {trace.writes.length === 0 ? (
          <p className="text-muted-foreground">{t("why.noWrites")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {trace.writes.map((write, index) => (
              // Tries come in order and never change: a try's place is its identity.
              <li key={index} className="flex flex-col">
                <span>
                  {write.refused === null
                    ? t("why.tryPassed", { number: index + 1 })
                    : t("why.tryRefused", { number: index + 1, code: write.refused })}
                </span>
                <span className="text-label wrap-anywhere">{write.answer}</span>
              </li>
            ))}
          </ol>
        )}
      </Part>
    </div>
  );
}
