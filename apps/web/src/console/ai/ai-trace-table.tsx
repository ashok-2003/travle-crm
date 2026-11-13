// An organization's AI turns on tablets and wider: a table, newest first, each time leading to the turn's page and each
// chat to that chat's turns. Codes show as recorded; a null one shows "none". Costs only when the console has prices.
import type { AiTraceRow } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { useInstantText } from "@/components/instant-text";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { consoleRoutes } from "../routes";
import { useTraceWords } from "./trace-words";

export function AiTraceTable({
  organizationId,
  traces,
  priced,
}: {
  organizationId: string;
  traces: AiTraceRow[];
  priced: boolean;
}) {
  const t = useTranslations("consoleAi.traces");
  const instantText = useInstantText();
  const words = useTraceWords();
  const code = (value: string | null) => <span className="numbers wrap-anywhere">{value ?? t("none")}</span>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.startedAt")}</TableHead>
          <TableHead scope="col">{t("columns.chat")}</TableHead>
          <TableHead scope="col">{t("columns.kind")}</TableHead>
          <TableHead scope="col">{t("columns.outcome")}</TableHead>
          <TableHead scope="col">{t("columns.move")}</TableHead>
          <TableHead scope="col">{t("columns.model")}</TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.tokens")}
          </TableHead>
          {priced && (
            <TableHead scope="col" className="text-right">
              {t("columns.cost")}
            </TableHead>
          )}
          <TableHead scope="col" className="text-right">
            {t("columns.duration")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {traces.map((trace) => (
          <TableRow key={trace.id}>
            <TableCell className="numbers whitespace-nowrap">
              <TextLink href={consoleRoutes.aiTrace(organizationId, trace.id)} inline>
                {instantText(trace.startedAt)}
              </TextLink>
            </TableCell>
            <TableCell className="numbers whitespace-nowrap">
              <TextLink href={consoleRoutes.aiTraces(organizationId, trace.conversationId)} inline>
                {words.chat(trace.conversationId)}
              </TextLink>
            </TableCell>
            <TableCell>{words.kind(trace.kind)}</TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col">
                {code(trace.outcome)}
                {trace.reason !== null && (
                  <span className="numbers text-caption wrap-anywhere text-muted-foreground">{trace.reason}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col">
                {code(trace.move)}
                {trace.saleStage !== null && (
                  <span className="numbers text-caption wrap-anywhere text-muted-foreground">{trace.saleStage}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">{code(trace.model)}</TableCell>
            <TableCell className="numbers text-right whitespace-nowrap">
              {words.tokens(trace.inputTokens, trace.outputTokens)}
            </TableCell>
            {priced && (
              <TableCell className="numbers text-right">
                {trace.costPaise === null ? t("none") : words.cost(trace.costPaise)}
              </TableCell>
            )}
            <TableCell className="numbers text-right whitespace-nowrap">{words.duration(trace.durationMs)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
