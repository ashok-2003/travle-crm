// The visual audit's lead export (release 2, bulk plan Part 2): the Leads header with its pills, the Export dialog with
// what the file holds and the format, the dialog preparing the file (the worker's answer held at a third done, as the
// worker is quicker than a camera), the file ready with Download, the export's page the bell leads to, and a
// salesperson's dialog holding only their own leads. Every lead is made through the api (R54).
import type { Page } from "@playwright/test";
import { expect, signInByCode, signInByEmail, test } from "../support/fixtures";
import { addLeadThroughApi, callApi, leadInput, leadWorkerAgency, moveStageThroughApi } from "../support/leads";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

/** The export procedure's answer, held at 104 of 312 leads while the file is made. */
async function holdExportPreparing(page: Page): Promise<void> {
  await page.route("**/api/trpc/leadExports.get*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { result?: { data?: Record<string, unknown> } }[];
    const held = body.map((item) =>
      item.result?.data
        ? {
            result: {
              data: {
                ...item.result.data,
                status: "making",
                rowsTotal: 312,
                rowsDone: 104,
                file: null,
                readyAt: null,
                expiresAt: null,
              },
            },
          }
        : item,
    );
    await route.fulfill({ response, json: held });
  });
}

test("the lead export: header, dialog, preparing, ready, the page and a salesperson's own", async ({
  page,
  agency,
  addStaff,
}) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const trip = (destination: string) => ({
    destination: { kind: "new" as const, name: destination },
    adults: 2,
    tripType: "family" as const,
  });
  const contacted = async (name: string, phone: string, destination: string, ownerUserId: string | null) => {
    const leadId = await addLeadThroughApi(
      page,
      leadInput({ person: { name, phone }, ownerUserId, trip: trip(destination) }),
    );
    await moveStageThroughApi(page, leadId, "contacted");
  };
  await contacted("Sneha Iyer", "+919845011234", "Goa", null);
  await contacted("Amit Verma", "+919811045526", "Goa", ravi.userId);
  await contacted("Arjun Mehta", "+919769023418", "Goa", null);
  await contacted("Kiran Joshi", "+919004066321", "Manali", null);
  await addLeadThroughApi(page, leadInput({ person: { name: "Priya Nair", phone: "+919847031905" } }));
  const places = await callApi<{ id: string; name: string }[]>(page, "destinations.search", { limit: 100 });
  const goaId = places.find((place) => place.name === "Goa")?.id;
  if (goaId === undefined) throw new Error("Goa wasn't added");

  await page.goto(`/leads?view=everyone&stage=contacted&destination=${goaId}`);
  await expect(page.getByRole("main").getByText("Sneha Iyer").first()).toBeVisible();
  await shoot(page, "leads-header");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export leads" });
  await expect(dialog.getByText("Everyone · Contacted · Goa")).toBeVisible();
  await shoot(page, "lead-export-dialog");

  await holdExportPreparing(page);
  await dialog.getByRole("button", { name: "Prepare the file" }).click();
  await expect(dialog.getByText("Preparing 312 leads…")).toBeVisible();
  await shoot(page, "lead-export-preparing");
  await page.unroute("**/api/trpc/leadExports.get*");

  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 60_000 });
  await shoot(page, "lead-export-ready");
  await dialog.getByRole("button", { name: "Close" }).first().click();

  // The bell says the file is ready, and leads to its page.
  await page.reload();
  await page
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("dialog", { name: "Notifications" })
    .getByRole("link", { name: /Your leads export is ready/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Leads export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await shoot(page, "lead-export-page");

  await page.context().clearCookies();
  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto("/leads");
  await expect(page.getByRole("main").getByText("Amit Verma").first()).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export leads" }).getByText("Mine · Open")).toBeVisible();
  await shoot(page, "lead-export-sales");
});
