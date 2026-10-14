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

/**
 * Refuses a line break in any value that becomes a header. One would let the text after it be read as a new header
 * (an extra Bcc, say), so it is refused outright rather than cleaned up.
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
}
