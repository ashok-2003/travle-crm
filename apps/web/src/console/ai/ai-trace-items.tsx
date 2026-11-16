// An organization's AI turns on phones: a list of items, each titled by its time (leading to the turn) and outcome,
// described by move, stage, tokens and cost.
import type { AiTraceRow } from "@travel-crm/contracts/platform";
import { Fragment } from "react";
import { useInstantText } from "@/components/instant-text";
import { TextLink } from "@/components/text-link";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { consoleRoutes } from "../routes";
import { useTraceWords } from "./trace-words";

export function AiTraceItems({
  organizationId,
  traces,
  priced,
}: {
  organizationId: string;
  traces: AiTraceRow[];
  priced: boolean;
}) {
  const instantText = useInstantText();
  const words = useTraceWords();
  return (
    <ItemGroup>
      {traces.map((trace, index) => (
        <Fragment key={trace.id}>
          {index > 0 && <ItemSeparator />}
          <div role="listitem">
            <Item size="sm">
              <ItemContent>
                <ItemTitle className="flex-wrap">
                  <TextLink href={consoleRoutes.aiTrace(organizationId, trace.id)}>
                    <span className="numbers">{instantText(trace.startedAt)}</span>
                  </TextLink>
                  <span className="numbers wrap-anywhere">{trace.outcome}</span>
                </ItemTitle>
                <ItemDescription className="numbers wrap-anywhere">
                  {[
                    words.kind(trace.kind),
                    trace.reason,
                    trace.move,
                    trace.saleStage,
                    words.tokens(trace.inputTokens, trace.outputTokens),
                    priced && trace.costPaise !== null ? words.cost(trace.costPaise) : null,
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")}
                </ItemDescription>
                <TextLink href={consoleRoutes.aiTraces(organizationId, trace.conversationId)}>
                  {words.chat(trace.conversationId)}
                </TextLink>
              </ItemContent>
            </Item>
          </div>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
