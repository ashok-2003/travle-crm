// Renders WhatsApp's formatting (bold, italic, strike, code, lists, quotes) as plain semantic elements: text is only ever
// text, never HTML, and web addresses open in a tab of their own without passing on where they came from.
import { Fragment, type ReactNode } from "react";
import { parseWhatsApp, type Span } from "./whatsapp-format";

// With `blanks` set, a {blank} is swapped for private-use characters before parsing, which the marker rules read as edges inside a word, so a run
// like *Hi {name}* stays one bold run around the highlighted blank; Spans turns them back.
const BLANK = /\{([a-z]+)\}/g;
const HIDDEN_BLANK = /\uE000([a-z]+)\uE001/g;
const restoreBlanks = (text: string) => text.replace(HIDDEN_BLANK, "{$1}");

function withBlanks(text: string): ReactNode {
  return text.split(HIDDEN_BLANK).map((part, index) =>
    // The split keeps each blank's name at an odd place.
    index % 2 === 1 ? (
      <span key={`${String(index)}-${part}`} className="bg-status-attention-fill text-status-attention-ink">
        {`{${part}}`}
      </span>
    ) : (
      <Fragment key={`${String(index)}-text`}>{part}</Fragment>
    ),
  );
}

function Spans({ spans, blanks }: { spans: Span[]; blanks: boolean }) {
  return spans.map((span, index) => {
    let node: ReactNode = blanks ? withBlanks(span.text) : span.text;
    if (span.href !== undefined) {
      node = (
        <a
          href={blanks ? restoreBlanks(span.href) : span.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {node}
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

/** `blanks` marks each {blank} still in the text, for a message the person must finish before sending. */
export function WhatsAppText({ text, blanks = false }: { text: string; blanks?: boolean }) {
  return (
    <div className="flex flex-col gap-1 whitespace-pre-wrap break-words">
      {parseWhatsApp(blanks ? text.replace(BLANK, "\uE000$1\uE001") : text).map((block, index) => {
        const key = String(index);
        switch (block.kind) {
          case "paragraph":
            return (
              <p key={key}>
                <Spans spans={block.spans} blanks={blanks} />
              </p>
            );
          case "quote":
            // A bar from a theme token, not a border: the quote's own start edge.
            return (
              <blockquote
                key={key}
                className="relative ps-3 before:absolute before:inset-y-0 before:start-0 before:w-1 before:rounded-full before:bg-muted-foreground/40"
              >
                <Spans spans={block.spans} blanks={blanks} />
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="rounded-md bg-muted p-2 font-mono text-label whitespace-pre-wrap">
                {blanks ? withBlanks(block.text) : block.text}
              </pre>
            );
          case "bullets":
          case "numbered": {
            const List = block.kind === "bullets" ? "ul" : "ol";
            return (
              <List key={key} className={`ms-5 ${block.kind === "bullets" ? "list-disc" : "list-decimal"}`}>
                {block.items.map((item, at) => (
                  <li key={String(at)}>
                    <Spans spans={item} blanks={blanks} />
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
