// Types for saxen (read-excel-file's own SAX parser, which ships none): the parts the workbook's sizing uses.
declare module "saxen" {
  /** Where the parser is, for an error's message. */
  type ContextGetter = () => { line: number; column: number; data: string };
  /** Decodes the entities in a raw attribute value or text: saxen leaves them as written. */
  type Decode = (text: string) => string;

  export class Parser {
    constructor(options?: { proxy?: boolean });
    /** Attributes are raw, prefixes and entities as written; `false` when they don't parse. */
    on(
      event: "openTag",
      handler: (
        name: string,
        attributes: () => Record<string, string> | false,
        decode: Decode,
        selfClosing: boolean,
        context: ContextGetter,
      ) => void,
    ): void;
    on(
      event: "closeTag",
      handler: (name: string, decode: Decode, selfClosing: boolean, context: ContextGetter) => void,
    ): void;
    on(event: "text" | "comment", handler: (value: string, decode: Decode, context: ContextGetter) => void): void;
    on(event: "cdata" | "question" | "attention", handler: (value: string, context: ContextGetter) => void): void;
    on(event: "error" | "warn", handler: (error: Error, context: ContextGetter) => void): void;
    /** A whole document; the error, if one stopped it. */
    parse(xml: string): Error | undefined;
    /** A chunk of a streamed document: the parser keeps an unfinished token until the next. */
    write(xml: string): this;
    /** The stream's end; the error, if its rest is unfinished. */
    end(): Error | undefined;
    /** Stops parsing: no more events. */
    stop(): void;
  }
}
