// The email port (spec 9.4): what the domain needs to send one email. The adapter owns the sender address, because
// email always comes from our domain; the domain chooses the display name and the organization's Reply-To.

export interface EmailMessage {
  to: { name?: string | undefined; address: string };
  /** The display name, e.g. "Sharma Travels via <product name>". */
  fromName: string;
  /** The organization's contact address, so replies reach the agency rather than us. */
  replyTo?: string | undefined;
  subject: string;
  text: string;
  html: string;
  /** Extra headers such as List-Unsubscribe. */
  headers?: Readonly<Record<string, string>> | undefined;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Headers the sender sets itself or that decide who gets the message: custom headers may not touch them. */
const RESERVED_HEADERS = new Set([
  "to",
  "cc",
  "bcc",
  "from",
  "sender",
  "reply-to",
  "return-path",
  "subject",
  "mime-version",
]);

const HEADER_NAME = /^[A-Za-z0-9-]+$/;

/** One plain address: no display name, list, quotes, comments or angle brackets. */
const PLAIN_ADDRESS = /^[^\s,;<>"()\\]+@[^\s,;<>"()\\]+$/;

/**
 * Refuses what could change who gets the message or forge its headers, outright rather than cleaning it up: a line
 * break in any value that becomes a header (it would start a new header, an extra Bcc say), an encoded word in the
 * sender's name, an address that is really a list, a custom header the sender controls itself, and the placeholder
 * addresses given to staff without email. Error messages name the field, never the value: they end up in job errors.
 */
export function assertSafeHeaders(message: EmailMessage): void {
  const values: [string, string | undefined][] = [
    ["subject", message.subject],
    ["fromName", message.fromName],
    ["replyTo", message.replyTo],
    ["to.name", message.to.name],
    ["to.address", message.to.address],
    // A header's name and value both end up on the header line.
    ...Object.entries(message.headers ?? {}).map(([name, value]): [string, string] => [
      `header ${name}`,
      `${name}: ${value}`,
    ]),
  ];
  for (const [field, value] of values) {
    if (value !== undefined && /[\r\n]/.test(value)) {
      throw new RangeError(`The email's ${field} has a line break, which would start a new header`);
    }
  }

  for (const [field, name] of [
    ["fromName", message.fromName],
    ["to.name", message.to.name],
  ] as const) {
    if (name?.includes("=?")) {
      throw new RangeError(`The email's ${field} has an encoded word, which could hide other text`);
    }
  }
  for (const [field, address] of [
    ["to.address", message.to.address],
    ["replyTo", message.replyTo],
  ] as const) {
    if (address !== undefined && !PLAIN_ADDRESS.test(address)) {
      throw new RangeError(`The email's ${field} is not a single plain address`);
    }
  }
  if (message.to.address.toLowerCase().endsWith(".invalid")) {
    throw new RangeError("The email's recipient has a placeholder address, which is never emailed");
  }
  for (const name of Object.keys(message.headers ?? {})) {
    // Only plain tokens: nodemailer trims a name like "Bcc " and would treat it as the real header.
    if (!HEADER_NAME.test(name)) {
      throw new RangeError("An email header name may only have letters, digits and hyphens");
    }
    const lower = name.toLowerCase();
    if (RESERVED_HEADERS.has(lower) || lower.startsWith("content-")) {
      throw new RangeError(`The email header ${name} is set by the sender and can't be given`);
    }
  }
}
