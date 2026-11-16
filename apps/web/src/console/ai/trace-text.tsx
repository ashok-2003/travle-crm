// The console's long recorded text (a prompt, an answer, a lookup): wrapped where it lands, never a box that scrolls.
import type { ReactElement } from "react";

/** JSON text indented two spaces; anything else as it is. */
export function readableJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Long recorded text, wrapped: a <pre> that breaks anywhere, in the text's own direction, so the page never scrolls sideways. */
export function TraceText({ text, label }: { text: string; label: string }): ReactElement {
  return (
    <pre
      role="group"
      aria-label={label}
      dir="auto"
      className="font-sans text-label whitespace-pre-wrap wrap-anywhere script-leading"
    >
      {text}
    </pre>
  );
}
