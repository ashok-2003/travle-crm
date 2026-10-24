// WhatsApp's steps for its journeys: MSG91's own calls to the webhook (the path with its token and the static header), as
// the journeys' stand-in for MSG91's panel, and the console steps that record a number and mark it connected.
import { expect, type Page } from "@playwright/test";
import { createDatabase, type OrgTx } from "@travel-crm/db";
import { msg91Signer } from "@travel-crm/integrations/whatsapp";
import { MSG91_E2E, type FakeSent } from "./fake-msg91";

const signer = msg91Signer({ token: MSG91_E2E.webhookToken, key: MSG91_E2E.webhookKey });

let counter = 0;

/**
 * A number of ours as MSG91 writes it (digits with the country code), new for each journey: a number belongs to one agency at
 * a time across all of them, and the phone and desktop runs go at once.
 */
export function newBusinessNumber(): string {
  counter += 1;
  return `9190${String(Math.floor(Math.random() * 90_000_000) + counter).padStart(8, "0")}`;
}

/** A number no other journey uses: ten digits after 91, so the product reads it as an Indian mobile. */
export function newCustomerNumber(): string {
  counter += 1;
  return `9198${String((Date.now() % 90_000_000) + counter).padStart(8, "0")}`;
}

/** What MSG91 would post to the webhook for these events; returns the status the api answered. */
export async function deliverWhatsapp(
  events: readonly object[],
  options: { token?: string; key?: string } = {},
): Promise<number> {
  const api = process.env.E2E_API_URL;
  if (!api) throw new Error("E2E_API_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  const response = await fetch(`${api}/webhooks/msg91-whatsapp/${options.token ?? MSG91_E2E.webhookToken}`, {
    method: "POST",
    headers: { ...signer.headers, "x-travel-crm-key": options.key ?? MSG91_E2E.webhookKey },
    body: signer.body(events),
  });
  return response.status;
}

/** A customer's message to our number, as MSG91 sends it. */
export function customerMessage(input: {
  /** Our number the customer wrote to. */
  to: string;
  customerNumber: string;
  text?: string;
  name?: string;
  contentType?: string;
  url?: string;
  caption?: string;
}) {
  return signer.inbound({
    integratedNumber: input.to,
    wamid: `wamid.e2e-${crypto.randomUUID()}`,
    ts: Math.floor(Date.now() / 1000),
    ...(input.name === undefined ? {} : { customerName: input.name }),
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.contentType === undefined ? {} : { contentType: input.contentType }),
    ...(input.url === undefined ? {} : { url: input.url }),
    ...(input.caption === undefined ? {} : { caption: input.caption }),
    customerNumber: input.customerNumber,
  });
}

/** Records the agency's number in the console (Connect a number), as a super admin does. */
export async function recordNumber(page: Page, organizationId: string, integratedNumber: string): Promise<void> {
  await page.goto(`/console/organizations/${organizationId}`);
  const group = page.getByRole("region", { name: "WhatsApp" });
  await group.getByRole("button", { name: "Connect a number" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a WhatsApp number" });
  await dialog.getByLabel("The agency's number").fill(integratedNumber.slice(2));
  await dialog.getByLabel("The number as MSG91 writes it").fill(integratedNumber);
  await dialog.getByRole("button", { name: "Record the number" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(group.getByText("Waiting for the first message", { exact: false })).toBeVisible();
}

/**
 * Records the agency's number as a super admin does, sends test messages from an operator's phone until the console shows the
 * webhook arrived, and marks it connected. Returns our number.
 */
export async function connectNumber(page: Page, organizationId: string): Promise<string> {
  const business = newBusinessNumber();
  await recordNumber(page, organizationId, business);
  const group = page.getByRole("region", { name: "WhatsApp" });
  // The operator's own phone: a message still waiting in the queue when the number is marked connected would become a lead,
  // and it must not be a customer's.
  const operator = newCustomerNumber();
  // The number's route is made by a listener of the worker, a moment after it was recorded: the test message is sent until the
  // console shows it arrived, as the operator would send it again.
  await expect(async () => {
    expect(
      await deliverWhatsapp([customerMessage({ to: business, customerNumber: operator, text: "test message" })]),
    ).toBe(200);
    await page.reload();
    await expect(group.getByText(/Webhook received/)).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 150_000 });
  await group.getByRole("button", { name: "Mark connected" }).click();
  await expect(group.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });
  return business;
}

const fakeUrl = (): string => {
  const url = process.env.E2E_MSG91_URL;
  if (!url) throw new Error("E2E_MSG91_URL is not set");
  return url;
};

/** What the fake MSG91 was asked to send to this customer, oldest first. */
export async function sentTo(customerNumber: string): Promise<FakeSent[]> {
  const response = await fetch(`${fakeUrl()}/_sent?to=${customerNumber}`);
  return (await response.json()) as FakeSent[];
}

/** The fake refuses the next message to this customer, as WhatsApp does for a number that is not on it. */
export async function refuseNextSendTo(customerNumber: string): Promise<void> {
  await fetch(`${fakeUrl()}/_refuse-next?to=${customerNumber}`, { method: "POST" });
}

/** A delivery report from MSG91 for a message we sent. */
export async function reportStatus(
  input: { business: string; customerNumber: string; wamid: string },
  eventName: "sent" | "delivered" | "read" | "failed",
): Promise<void> {
  const status = await deliverWhatsapp([
    signer.status({
      integratedNumber: input.business,
      customerNumber: input.customerNumber,
      wamid: input.wamid,
      eventName,
      ts: Math.floor(Date.now() / 1000),
    }),
  ]);
  expect(status).toBe(200);
}

/** Runs work against the agency's rows as the runtime role, for the facts the screens do not show or the clock they cannot move. */
export async function inAgency<T>(organizationId: string, work: (tx: OrgTx) => Promise<T>): Promise<T> {
  const database = createDatabase(process.env.E2E_DATABASE_URL ?? "");
  try {
    return await database.forOrg(organizationId, work);
  } finally {
    await database.disconnect();
  }
}

/** Asks the worker for a connection health check now, instead of at the next five minutes (a job on the check's own queue). */
export async function runHealthCheckNow(): Promise<void> {
  const database = createDatabase(process.env.E2E_DATABASE_URL ?? "");
  try {
    await database.withoutOrg(
      (tx) => tx.$executeRaw`INSERT INTO pgboss.job (name, data) VALUES ('whatsapp.health', '{}'::jsonb)`,
    );
  } finally {
    await database.disconnect();
  }
}
