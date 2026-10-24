// WhatsApp's steps for its journeys: MSG91's own calls to the webhook (the path with its token and the static header), as
// the journeys' stand-in for MSG91's panel, and the console steps that record a number and mark it connected.
import { expect, type Page } from "@playwright/test";
import { msg91Signer } from "@travel-crm/integrations/whatsapp";
import { MSG91_E2E } from "./fake-msg91";

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
