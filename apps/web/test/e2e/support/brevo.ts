// Brevo for the failed-emails journey: the webhook's two test settings the api and the worker run with, the reference
// the email log put on an email (its X-Mailin-custom header, read from Mailpit), and Brevo's own call to the webhook
// saying it dropped that email, as the journeys' stand-in for Brevo.

/** The two Brevo settings the api and the worker run with in the journeys: test values, for this run only. */
export const BREVO_E2E = {
  webhookToken: "e2e0brevowebhooktoken0123456789abcdef0123",
  webhookKey: "e2e-brevo-webhook-key-0123456789-abcdefghij",
} as const;

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the journeys with \`pnpm --filter @travel-crm/web e2e\``);
  return value;
}

async function mailpit<T>(path: string): Promise<T> {
  const response = await fetch(`${environment("E2E_MAILPIT_URL")}/api/v1${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${String(response.status)}`);
  return (await response.json()) as T;
}

interface MessageSummary {
  ID: string;
  To: { Address: string }[];
}

/** The emails that reached address so far, oldest first. */
export async function emailsTo(address: string): Promise<MessageSummary[]> {
  const { messages } = await mailpit<{ messages: MessageSummary[] }>("/messages");
  return messages.filter((message) => message.To.some((to) => to.Address === address)).reverse();
}

/** The email log's reference on the first email to address, waiting up to 10 seconds for it to arrive. */
export async function referenceOfEmailTo(address: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [sent] = await emailsTo(address);
    if (sent) {
      const headers = await mailpit<Record<string, string[]>>(`/message/${sent.ID}/headers`);
      const name = Object.keys(headers).find((header) => header.toLowerCase() === "x-mailin-custom");
      const reference = name === undefined ? undefined : headers[name]?.[0];
      if (reference === undefined) throw new Error("the email carries no X-Mailin-custom header");
      return reference;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no email reached ${address}`);
}

/** Brevo's webhook call saying it dropped the email with this reference; returns the status the api answered. */
export async function brevoReportsDropped(reference: string, address: string, subject: string): Promise<number> {
  const now = Date.now();
  const response = await fetch(`${environment("E2E_API_URL")}/webhooks/brevo/${BREVO_E2E.webhookToken}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${BREVO_E2E.webhookKey}` },
    body: JSON.stringify({
      event: "blocked",
      email: address,
      subject,
      "message-id": `<${crypto.randomUUID()}@smtp-relay.mailin.fr>`,
      "X-Mailin-custom": reference,
      reason: "Account under review",
      ts: Math.floor(now / 1000),
      ts_epoch: now,
    }),
  });
  return response.status;
}
