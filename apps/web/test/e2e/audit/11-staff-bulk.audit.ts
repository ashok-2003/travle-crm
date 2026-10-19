// The visual audit's staff screens (release 2, bulk plan Task 3.8): Staff with Add staff, Import and Export; Add staff
// with a phone and Change phone; a team's import at its columns (a Designation column of roles to match), its preview
// with the seats (rows left out, someone already on the staff), a bigger file over the seats with Add off; the done
// screen with the passwords shown once, and again without them; and the Export dialog. The agency is on a plan of 20
// seats, as the mockup draws it.
import { planModules } from "@travel-crm/contracts/subscriptions";
import { expect, signInByEmail, test } from "../support/fixtures";
import { chooseImportFile, csvOf, waitForImportStatus } from "../support/imports";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

const header = ["Full Name", "Login", "Email Id", "Mobile No", "Designation"];

/** The mockup's team: a Designation column of words that match roles, and some that don't. */
const team = (code: string): string[][] => [
  header,
  ["Kavita Rao", "kavita", `kavita.rao.${code}@example.test`, "98765 43210", "Sales"],
  ["Imran Qureshi", "imran", "", "98330 41275", "Telecaller"],
  ["Deepak Nair", "", `deepak.nair.${code}@example.test`, "", "Operations"],
  ["Lakshmi Iyer", "lakshmi", "", "", "Accounts"],
  ["Arvind Menon", "arvind", "", "", "Sales"],
  ["Ravi Kumar", "ravi", "", "", "Sales"],
  ["Pooja Desai", "", "", "", "Sales"],
];

/** A file of `count` more people, all with a role the agency has. */
const crowd = (count: number, code: string): string[][] => [
  header,
  ...Array.from({ length: count }, (_, index) => [
    `Person ${String(index + 1)}`,
    `crowd${String(index + 1)}`,
    `crowd-${String(index + 1)}.${code}@example.test`,
    "",
    "Sales",
  ]),
];

test("the staff screens, the import from its columns to its passwords, and the export", async ({
  page,
  agency,
  addStaff,
  database,
}) => {
  const plan = await database.platform.plan.create({
    data: {
      key: `twenty-${agency.code.toLowerCase()}`,
      name: "Twenty seats (tests)",
      monthlyPricePaise: 0,
      seatLimit: 20,
      whatsappNumberLimit: 1,
      storageLimitBytes: 1_000_000_000_000n,
      modules: [...planModules],
    },
  });
  await database.platform.subscription.update({
    where: { organizationId: agency.organizationId },
    data: { planId: plan.id },
  });
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await addStaff({ name: "Meera Iyer", username: "meera", roleKey: "operations" });
  await signInByEmail(page, agency.owner);
  const code = agency.code.toLowerCase();

  await page.goto("/staff");
  await expect(page.getByText("Meera Iyer")).toBeVisible();
  await shoot(page, "staff-header");

  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  await form.getByLabel("Full name").fill("Kavita Rao");
  await form.getByLabel("Username").fill("kavita.rao");
  await form.getByLabel("Phone").fill("98765 43210");
  await shoot(page, "staff-add-with-phone");
  await form.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Actions for Meera Iyer" }).click();
  await page.getByRole("menuitem", { name: "Change phone" }).click();
  await page.getByRole("dialog", { name: "Change Meera Iyer's phone" }).getByLabel("Phone").fill("98111 22233");
  await shoot(page, "staff-change-phone");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("link", { name: "Import" }).click();
  await chooseImportFile(page, { name: "staff-list.csv", mimeType: "text/csv", buffer: csvOf(team(code)) });
  await waitForImportStatus(page, /Match your columns/);
  await shoot(page, "staff-import-match");

  await page.getByRole("button", { name: "Check the rows" }).click();
  await waitForImportStatus(page, /Will be added/);
  await shoot(page, "staff-import-check");

  // A bigger file than the seats left.
  await page.goto("/staff/import");
  await chooseImportFile(page, { name: "big-team.csv", mimeType: "text/csv", buffer: csvOf(crowd(25, code)) });
  await waitForImportStatus(page, /Match your columns/);
  await page.getByRole("button", { name: "Check the rows" }).click();
  await waitForImportStatus(page, /Will be added/);
  await expect(page.getByRole("button", { name: /^Add 25 people$/ })).toBeDisabled();
  await shoot(page, "staff-import-over-seats");

  // Back to the first file, which fits: Add it.
  await page.goto("/staff/import");
  await page.getByRole("link", { name: "staff-list.csv" }).first().click();
  await waitForImportStatus(page, /Will be added/);
  const people = Number(
    /Add (\d+) people/.exec(await page.getByRole("button", { name: /^Add \d+ people$/ }).innerText())?.[1],
  );
  await page.getByRole("button", { name: /^Add \d+ people$/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: new RegExp(`^Add ${String(people)} people$`) })
    .click();
  await waitForImportStatus(page, /people added/);
  await expect(page.getByText("Download these passwords now")).toBeVisible();
  await shoot(page, "staff-import-passwords");

  await page.reload();
  await expect(page.getByText(/These passwords were shown once/)).toBeVisible();
  await shoot(page, "staff-import-passwords-lost");

  await page.goto("/staff");
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("dialog", { name: "Export staff" })).toBeVisible();
  await shoot(page, "staff-export-dialog");
});
