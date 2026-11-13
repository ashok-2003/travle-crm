// The chat's messages a turn names, as the chat keeps them now: who, when, and the words (or "no words").
import type { AiTraceMessage } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { useInstantText } from "@/components/instant-text";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";

export function TraceMessages({ messages }: { messages: AiTraceMessage[] }) {
  const t = useTranslations("consoleAi.trace");
  const instantText = useInstantText();
  return (
    <ItemGroup>
      {messages.map((message, index) => (
        <Fragment key={message.id}>
          {index > 0 && <ItemSeparator />}
          <div role="listitem">
            <Item size="sm">
              <ItemContent>
                <ItemTitle className="flex-wrap">
                  <span className="numbers">
                    {t(`from.${message.from}`)} · {instantText(message.at)}
                  </span>
                  {message.kind !== "text" && <span className="numbers text-muted-foreground">({message.kind})</span>}
                </ItemTitle>
                <ItemDescription dir="auto" className="line-clamp-none whitespace-pre-wrap wrap-anywhere">
                  {message.text === "" ? t("noWords") : message.text}
                </ItemDescription>
              </ItemContent>
            </Item>
          </div>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
