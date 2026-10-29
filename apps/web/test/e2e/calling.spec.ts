// Calling (release 5, scope 3.4), on a phone and a desktop, against the real api and worker:
// - from a lead the person calls (a phone's Call dials; a computer's opens the call panel with the number and a QR code),
//   then writes the call up: its outcome, a note and the next follow-up, which land on the lead's timeline and work;
// - Send to my phone pushes "Call {name}" to the person's own device, and the page it opens dials.
// There is no phone provider here and no recording: the person's own phone does the calling.
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./support/notifications";
import { signInByEmail } from "./support/fixtures";
import { addLeadThroughApi, leadInput } from "./support/leads";

const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

/** Runs in the page before the app: notifications allowed, and a push manager that hands out one subscription. */
function standInPush(): void {
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${crypto.randomUUID()}`;
  const keys = { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) };
  let current: object | null = null;
  const subscription = {
    endpoint,
    expirationTime: null,
    toJSON: () => ({ endpoint, expirationTime: null, keys }),
    unsubscribe: () => {
      current = null;
      return Promise.resolve(true);
    },
  };
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
  Notification.requestPermission = () => Promise.resolve("granted");
  PushManager.prototype.subscribe = function subscribe() {
    current = subscription;
    return Promise.resolve(subscription as unknown as PushSubscription);
  };
  PushManager.prototype.getSubscription = function getSubscription() {
    return Promise.resolve(current as PushSubscription | null);
  };
}

/** Starts a call to the lead's person: the phone's Call link (the dialler is not here, so the tap is held back), or the panel's Log the call. */
async function startCall(page: Page, testInfo: TestInfo): Promise<void> {
  const call = page.getByRole("link", { name: "Call Rahul Sharma" });
  if (isPhone(testInfo)) {
    await expect(call).toHaveAttribute("href", "tel:+919876543210");
    // No dialler in the browser: hold the tap back, then come back to the app as the person does after the call.
    await call.evaluate((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
      });
    });
    await call.click();
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    return;
  }
  await page.getByRole("button", { name: "Call Rahul Sharma" }).click();
  const panel = page.getByRole("dialog", { name: "Call Rahul Sharma" });
  await expect(panel).toContainText("+91 98765 43210");
  await expect(panel.getByRole("img", { name: "A QR code that dials Rahul Sharma" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Dial from this device" })).toHaveAttribute("href", "tel:+919876543210");
  await panel.getByRole("button", { name: "Log the call" }).click();
}

test("call a lead, then write the call up with a note and the next follow-up", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput());
  await page.goto(`/leads/${leadId}`);
  await startCall(page, testInfo);

  const dialog = page.getByRole("dialog", { name: "How did the call go?" });
  await expect(dialog).toBeVisible();
  // Nobody answered: a follow-up is offered, which the person keeps.
  await dialog.getByRole("radio", { name: "No answer" }).check();
  await expect(dialog.getByRole("checkbox", { name: /Add a follow-up/ })).toBeChecked();
  await dialog.getByLabel("Note").fill("Rang twice, try again after lunch");
  await dialog.getByRole("button", { name: "Save the call" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Call saved")).toBeVisible();

  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByRole("heading", { name: "Call: No answer" })).toBeVisible();
  await expect(timeline.getByText("Rang twice, try again after lunch")).toBeVisible();
  await expect(timeline.getByText("Follow-up added")).toBeVisible();
  await expect(page.getByText("1 call", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Next follow-up" })).toContainText("Call back");
});

test("a call that spoke marks a New lead contacted; the call can be changed and deleted", async ({
  page,
  agency,
}, testInfo) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput());
  await page.goto(`/leads/${leadId}`);
  await startCall(page, testInfo);
  const dialog = page.getByRole("dialog", { name: "How did the call go?" });
  await dialog.getByRole("radio", { name: "Spoke" }).check();
  await dialog.getByLabel("Note").fill("Wants Kashmir in May");
  await dialog.getByRole("button", { name: "Save the call" }).click();
  await expect(dialog).toBeHidden();

  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByRole("heading", { name: "Call: Spoke" })).toBeVisible();
  await expect(timeline.getByRole("heading", { name: "Moved to Contacted" })).toBeVisible();

  await timeline.getByRole("button", { name: /Edit the call/ }).click();
  const editing = page.getByRole("dialog", { name: "Change the call" });
  await editing.getByRole("radio", { name: "Busy or call later" }).check();
  await editing.getByRole("button", { name: "Save the call" }).click();
  await expect(editing).toBeHidden();
  await expect(timeline.getByRole("heading", { name: "Call: Busy or call later" })).toBeVisible();

  await timeline.getByRole("button", { name: /Delete the call/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(timeline.getByText("Wants Kashmir in May")).toHaveCount(0);
  await expect(page.getByText("1 call", { exact: true })).toHaveCount(0);
});

test("Send to my phone pushes the number to the person's own device, and the page it opens dials", async ({
  page,
  agency,
  owner,
  organizationData,
}, testInfo) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput());

  if (!isPhone(testInfo)) {
    await page.addInitScript(standInPush);
    await page.goto("/account/notifications");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const device = page.getByRole("region", { name: "On this device" });
    await device.getByRole("button", { name: "Turn on push" }).click();
    await expect(device.getByText("On", { exact: true })).toBeVisible();

    await page.goto(`/leads/${leadId}`);
    await page.getByRole("button", { name: "Call Rahul Sharma" }).click();
    await page.getByRole("button", { name: "Send to my phone" }).click();
    await expect(page.getByText(/Sent to your phone/)).toBeVisible();
    await expect
      .poll(() =>
        organizationData.forOrg(agency.organizationId, (tx) =>
          tx.notification.findMany({ where: { recipientUserId: owner.userId, kind: "call.dial" } }),
        ),
      )
      .toMatchObject([{ title: "Call Rahul Sharma", link: `/call/${leadId}` }]);
  }

  // The page the push opens: the name, the number and one big Call now.
  await page.goto(`/call/${leadId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await expect(page.getByText("+91 98765 43210")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call Rahul Sharma now" })).toHaveAttribute("href", "tel:+919876543210");
});
