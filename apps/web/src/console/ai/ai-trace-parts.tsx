// The five parts of one AI turn, a tab each: what Understand was given and returned, the lookups, the decision, what
// Write was given and wrote, and the checks with what was sent. Recorded codes show as recorded.
import type { AiTraceFile } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Details } from "@/components/details";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TraceMessages } from "./trace-messages";
import { readableJson, TraceText } from "./trace-text";

const code = (text: string) => <span className="numbers wrap-anywhere">{text}</span>;

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

export function UnderstandPart({ file }: { file: AiTraceFile }) {
  const t = useTranslations("consoleAi.trace");
  if (file.understand === null) return <p>{t("noUnderstand")}</p>;
  const { blocks, answer } = file.understand;
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => (
        // Titles may repeat: a block's place is its identity.
        <Part key={index} title={block.title}>
          <TraceText text={block.text} label={block.title} />
        </Part>
      ))}
      <Part title={t("messages")}>
        <p className="text-muted-foreground">{t("messagesIntro")}</p>
        {file.messages.length === 0 ? <p>{t("noWords")}</p> : <TraceMessages messages={file.messages} />}
        {file.messagesGone > 0 && <p>{t("messagesGone", { count: file.messagesGone })}</p>}
      </Part>
      <Part title={t("answer")}>
        {answer === null ? <p>{t("noAnswer")}</p> : <TraceText text={readableJson(answer)} label={t("answer")} />}
      </Part>
    </div>
  );
}

export function LookupsPart({ file }: { file: AiTraceFile }) {
  const t = useTranslations("consoleAi.trace");
  if (file.lookups.length === 0) return <p>{t("noLookups")}</p>;
  return (
    <div className="flex flex-col gap-4">
      {file.lookups.map((lookup, index) => (
        // The same tool may be asked twice in a turn: its place in the list is its identity.
        <Part key={index} title={lookup.tool}>
          <p className="text-muted-foreground">{t("asked")}</p>
          <TraceText text={lookup.request} label={`${lookup.tool}: ${t("asked")}`} />
          <p className="text-muted-foreground">{t("got")}</p>
          <TraceText text={lookup.result} label={`${lookup.tool}: ${t("got")}`} />
        </Part>
      ))}
    </div>
  );
}

export function DecisionPart({ file, move, stage }: { file: AiTraceFile; move: string | null; stage: string | null }) {
  const t = useTranslations("consoleAi.trace");
  const { decision } = file;
  // Recorded codes show as recorded; the AI's own sentences are plain words.
  const row = (label: string, value: ReactNode | null) => ({ label, ...(value === null ? {} : { value }) });
  const words = (text: string | null) =>
    text === null || text === "" ? null : <span className="wrap-anywhere">{text}</span>;
  const codes = (text: string | null) => (text === null || text === "" ? null : code(text));
  return (
    <Details
      rows={[
        row(t("decision.move"), codes(move)),
        row(t("decision.stage"), codes(stage)),
        row(t("decision.why"), words(decision.why)),
        row(t("decision.intents"), codes(file.intents.join(", "))),
        row(t("decision.note"), words(decision.note)),
        row(t("decision.task"), words(decision.task)),
        row(
          t("decision.suggest"),
          words(
            decision.suggest === null
              ? null
              : t("suggestion", { kind: decision.suggest.kind, reason: decision.suggest.reason }),
          ),
        ),
      ]}
    />
  );
}

export function WritePart({ file }: { file: AiTraceFile }) {
  const t = useTranslations("consoleAi.trace");
  if (file.write === null) return <p>{t("noWrite")}</p>;
  return (
    <div className="flex flex-col gap-4">
      {file.write.blocks.map((block, index) => (
        <Part key={index} title={block.title}>
          <TraceText text={block.text} label={block.title} />
        </Part>
      ))}
      <p className="text-muted-foreground">{t("writeMessages")}</p>
      <Part title={t("answers")}>
        {file.write.answers.map((answer, index) => (
          <div key={index} className="flex flex-col gap-2">
            <p className="font-medium">{t("try", { number: index + 1 })}</p>
            <TraceText text={readableJson(answer)} label={t("try", { number: index + 1 })} />
          </div>
        ))}
      </Part>
    </div>
  );
}

export function SentPart({ file }: { file: AiTraceFile }) {
  const t = useTranslations("consoleAi.trace");
  return (
    <div className="flex flex-col gap-4">
      <Part title={t("checks")}>
        {file.checks.length === 0 ? (
          <p>{t("noChecks")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t("check.name")}</TableHead>
                <TableHead scope="col">{t("check.result")}</TableHead>
                <TableHead scope="col">{t("check.detail")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {file.checks.map((check) => (
                <TableRow key={check.name}>
                  <TableCell className="whitespace-normal">{code(check.name)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={check.passed ? "good" : "bad"}>
                      {check.passed ? t("passed") : t("failed")}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="whitespace-normal wrap-anywhere">{check.detail ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Part>
      <Part title={t("sentText")}>
        {file.sent.text === null ? (
          <p>{t("nothingSent")}</p>
        ) : (
          <TraceText text={file.sent.text} label={t("sentText")} />
        )}
        {file.sent.messages.length > 0 && (
          <>
            <p className="text-muted-foreground">{t("sentMessages")}</p>
            <TraceMessages messages={file.sent.messages} />
          </>
        )}
      </Part>
      <Part title={t("actions")}>
        {file.actions.length === 0 ? <p>{t("noActions")}</p> : <p>{code(file.actions.join(", "))}</p>}
      </Part>
    </div>
  );
}
