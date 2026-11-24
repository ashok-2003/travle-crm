// Renders WhatsApp's formatting (bold, italic, strike, code, lists, quotes) as plain semantic elements: text is only ever
// text, never HTML, and web addresses open in a tab of their own without passing on where they came from.
import type { ReactNode } from "react";
import { parseWhatsApp, type Span } from "./whatsapp-format";

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, index) => {
    let node: ReactNode = span.text;
    if (span.href !== undefined) {
      node = (
        <a href={span.href} target="_blank" rel="noopener noreferrer" className="underline">
          {span.text}
        </a>
      );
    }
    if (span.code) node = <code className="font-mono">{node}</code>;
    if (span.strike) node = <s>{node}</s>;
    if (span.italic) node = <em>{node}</em>;
    if (span.bold) node = <strong className="font-semibold">{node}</strong>;
    return <span key={`${String(index)}-${span.text}`}>{node}</span>;
  });
}

export function WhatsAppText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1 whitespace-pre-wrap break-words">
      {parseWhatsApp(text).map((block, index) => {
        const key = String(index);
        switch (block.kind) {
          case "paragraph":
            return (
              <p key={key}>
                <Spans spans={block.spans} />
              </p>
            );
          case "quote":
            // A bar from a theme token, not a border: the quote's own start edge.
            return (
              <blockquote
                key={key}
                className="relative ps-3 before:absolute before:inset-y-0 before:start-0 before:w-1 before:rounded-full before:bg-muted-foreground/40"
              >
                <Spans spans={block.spans} />
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="rounded-md bg-muted p-2 font-mono text-label whitespace-pre-wrap">
                {block.text}
              </pre>
            );
          case "bullets":
          case "numbered": {
            const List = block.kind === "bullets" ? "ul" : "ol";
            return (
              <List key={key} className={`ms-5 ${block.kind === "bullets" ? "list-disc" : "list-decimal"}`}>
                {block.items.map((item, at) => (
                  <li key={String(at)}>
                    <Spans spans={item} />
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
