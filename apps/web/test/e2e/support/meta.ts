// The Meta lead ads' steps as a person takes them, for its journeys: a Facebook Page with a lead form in the fake Meta, the
// connect flow through Facebook's dialog (the fake login answers the dialog's address), bringing a form in, and Meta's own
// signed webhook sent to the api. The fake is the journeys' own (support/fake-meta.ts); the real api and worker run their
// real adapter against it.
import { expect, type Page } from "@playwright/test";
import {
  leadgenDeliveryBody,
  signWebhookBody,
  type LeadgenChange,
  type MetaFormQuestion,
} from "@travel-crm/integrations/meta-graph";
import { fakeMetaClient, META_E2E, type FakeMetaClient } from "./fake-meta";
import { WORKER_STEP_MS } from "./lead-import-steps";

/** The fake Meta the run started (E2E_META_URL), as a journey's own process reaches it. */
export function fakeMeta(): FakeMetaClient {
  const url = process.env.E2E_META_URL;
  if (!url) throw new Error("E2E_META_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  return fakeMetaClient(url);
}

/** What a lead form asks: a name, a phone and a question of the agency's own. */
export const FORM_QUESTIONS: MetaFormQuestion[] = [
  { key: "full_name", type: "full_name", label: "Full name" },
  { key: "phone_number", type: "phone", label: "Phone number" },
  { key: "where_do_you_want_to_go", type: "custom", label: "Where do you want to go?" },
];

let counter = 0;

/** A Meta id of the shape Meta's are (digits), new for each call: a Page can be connected to one agency only. */
export function newMetaId(): string {
  counter += 1;
  return `${String(Date.now())}${String(counter).padStart(3, "0")}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

export interface FacebookPage {
  code: string;
  pageId: string;
  pageName: string;
  token: string;
  formId: string;
  formName: string;
}

/** A login that shares one Page the person can advertise on, with one lead form, in the fake Meta. */
export async function aFacebookPage(
  meta: FakeMetaClient,
  options: { pageName?: string; formName?: string } = {},
): Promise<FacebookPage> {
  const page: FacebookPage = {
    code: `code-${newMetaId()}`,
    pageId: newMetaId(),
    pageName: options.pageName ?? "Rajasthan Holidays",
    token: `page-token-${newMetaId()}`,
    formId: newMetaId(),
    formName: options.formName ?? "Rajasthan winter ad",
  };
  await meta.addLogin(page.code, {
    userId: `user-${page.code}`,
    pages: [{ id: page.pageId, name: page.pageName, token: page.token, canAdvertise: true }],
  });
  await meta.addForm(page.pageId, { id: page.formId, name: page.formName, questions: FORM_QUESTIONS });
  return page;
}

/** A form the Page gains later, as an advertiser would make it. */
export async function anotherForm(meta: FakeMetaClient, page: FacebookPage, name: string): Promise<string> {
  const formId = newMetaId();
  await meta.addForm(page.pageId, { id: formId, name, questions: FORM_QUESTIONS });
  return formId;
}

/** The answers to the form's three questions, as a person sends them. */
export const answers = (name: string, phone: string, destination: string) => ({
  full_name: [name],
  phone_number: [phone],
  where_do_you_want_to_go: [destination],
});

/**
 * Connect a Page: Connect a Page, Continue with Facebook, and Facebook's dialog (answered here, with the code the fake
 * login knows and the state the product made), then the Page ticked and connected. Ends on the Page's own page.
 */
export async function connectFacebookPage(page: Page, facebook: FacebookPage): Promise<void> {
  const origin = process.env.E2E_BASE_URL;
  if (!origin) throw new Error("E2E_BASE_URL is not set");
  let dialog: URL | null = null;
  await page.route("https://www.facebook.com/**", async (route) => {
    dialog = new URL(route.request().url());
    const state = dialog.searchParams.get("state") ?? "";
    await route.fulfill({
      status: 302,
      headers: {
        location: `${origin}/settings/lead-sources/meta/callback?code=${facebook.code}&state=${encodeURIComponent(state)}`,
      },
    });
  });
  await page.goto("/settings/lead-sources/meta/connect");
  await expect(page.getByRole("heading", { level: 1, name: "Connect a Page" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Facebook" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose your Pages" })).toBeVisible({ timeout: 30_000 });
  // The dialog was asked for our saved configuration, and the code is gone from the address.
  expect((dialog as URL | null)?.searchParams.get("config_id")).toBe(META_E2E.loginConfigId);
  expect(page.url()).not.toContain("code=");
  await page.unroute("https://www.facebook.com/**");
  await expect(page.getByRole("checkbox", { name: facebook.pageName })).toBeChecked();
  await page.getByRole("button", { name: "Connect 1 Page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: facebook.pageName })).toBeVisible({ timeout: 30_000 });
}

/**
 * Bring a form in with its questions as guessed. "only new" ends on the Page's page with the form brought in; "also the last
 * 30 days" ends on the import's preview, which the worker makes from the form's earlier leads.
 */
export async function bringInForm(
  page: Page,
  formName: string,
  earlier: "only_new" | "last_30_days" = "only_new",
): Promise<void> {
  await page.getByRole("link", { name: `Bring in ${formName}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Match ${formName}` })).toBeVisible();
  if (earlier === "last_30_days") await page.getByRole("radio", { name: "Also check the last 30 days" }).check();
  await page.getByRole("button", { name: "Bring in the form" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Bring in", exact: true }).click();
  if (earlier === "last_30_days") {
    await expect(page.getByRole("heading", { level: 1, name: "Check before adding" })).toBeVisible({
      timeout: WORKER_STEP_MS,
    });
  } else {
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(`Match ${formName}`);
    await expect(page.getByRole("link", { name: `Edit the questions of ${formName}` })).toBeVisible();
  }
}

/** Meta's own delivery to the webhook, signed with the app secret (or not, or wrongly): the status the api answered. */
export async function deliverLeadgen(
  changes: LeadgenChange[],
  options: { signature?: "right" | "wrong" | "none" } = {},
): Promise<number> {
  const apiUrl = process.env.E2E_API_URL;
  if (!apiUrl) throw new Error("E2E_API_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  const body = leadgenDeliveryBody(changes);
  const signature = options.signature ?? "right";
  const response = await fetch(`${apiUrl}/webhooks/meta-leads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature === "none"
        ? {}
        : {
            "x-hub-signature-256": signWebhookBody(body, signature === "right" ? META_E2E.appSecret : "not-our-secret"),
          }),
    },
    body,
  });
  return response.status;
}

/** A lead of this name, in Leads (everyone's), once the worker has saved it. */
export async function waitForMetaLead(page: Page, name: string): Promise<void> {
  await expect(async () => {
    await page.goto("/leads?view=everyone&source=meta_lead_ad");
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: new RegExp(name) })
        .first(),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: WORKER_STEP_MS });
}
