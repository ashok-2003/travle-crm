// Share links (spec 9.3): an Owner makes a link to an issued document and copies it, a customer opens it at /p on the
// app's address and lands on the PDF, the open is counted, and once the Owner turns the link off it is refused.
import { renderedSample, saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, test } from "./support/fixtures";

test("an Owner shares a document by link, sees it opened, and turns the link off", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const sample = await renderedSample(page);
  await page.goto("/settings/documents");
  await page.getByRole("button", { name: `Share ${sample.number}` }).click();
  const dialog = page.getByRole("dialog", { name: `Share ${sample.number}` });
  await expect(dialog.getByText("No links yet.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Label" }).fill("For Meera Iyer");
  await dialog.getByRole("button", { name: "Create link" }).click();

  const shown = dialog.getByRole("textbox", { name: "The link" });
  await expect(shown).toHaveValue(/\/p\/[A-Za-z0-9_-]{65}$/);
  const link = await shown.inputValue();
  expect(new URL(link).origin).toBe(new URL(page.url()).origin);

  // The customer opens it: the app's address hands it to the api, which sends them to the PDF.
  const opened = await page.request.get(link, { maxRedirects: 0 });
  expect(opened.status()).toBe(302);
  const pdf = await page.request.get(opened.headers().location ?? "");
  expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog.getByText(/^Opened 1 time, last /)).toBeVisible();
  await dialog.getByRole("button", { name: "Turn off For Meera Iyer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off the link" }).click();
  await expect(dialog.getByText("Turned off")).toBeVisible();

  const refused = await page.request.get(link, { maxRedirects: 0 });
  expect(refused.status()).toBe(410);
  expect(await refused.text()).toContain("This link has been turned off");
});
