// The console's plans (spec 7.2): on sale and archived apart, each with its prices before GST, seats, WhatsApp
// numbers, storage and modules; a super admin creates, changes and archives them, and support sees them read-only,
// told why. Refusals show their sentence; loading, empty and failed states are honest.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlansScreen } from "@/console/plans/plans-screen";
import { messages } from "@/i18n/messages";
import { stubApi, type Answer } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "./render-console";

const { plans: words, planForm: form } = messages.consolePlatform;
const GIGABYTE = 1024 ** 3;

function plan(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: "0199a000-0000-7000-8000-0000000000a1",
    key: "growth",
    name: "Growth",
    monthlyPricePaise: 499_900,
    yearlyPricePaise: 4_999_000,
    extraSeatMonthlyPricePaise: 29_900,
    extraSeatYearlyPricePaise: null,
    seatLimit: 10,
    whatsappNumberLimit: 2,
    storageLimitBytes: 25 * GIGABYTE,
    modules: ["crm", "quotes"],
    forSale: true,
    archived: false,
    ...overrides,
  };
}

const starter = plan({
  id: "0199a000-0000-7000-8000-0000000000a2",
  key: "starter",
  name: "Starter",
  yearlyPricePaise: null,
  modules: [],
  archived: true,
});
const demo = plan({ id: "0199a000-0000-7000-8000-0000000000a3", key: "platform-demo", name: "Demo", forSale: false });
const policy = { data: { trialDays: 7, pastDueDays: 7, readOnlyDays: 14 } };

function open(plans: Answer, staff = platformStaff("super-admin")) {
  const api = stubApi({ "platform.plans.list": plans, "platform.plans.policy": policy });
  renderConsole(<PlansScreen />, staff);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlansScreen", () => {
  it("shows the plans on sale and the archived ones apart, with their prices, limits and modules", async () => {
    screenIs("wide");
    open({ data: [plan(), demo, starter] });
    const growth = await screen.findByRole("row", { name: /Growth/ });
    expect(within(growth).getByText("growth")).toBeVisible();
    expect(within(growth).getByText(words.onSale)).toBeVisible();
    expect(within(growth).getByText("₹4,999")).toBeVisible();
    expect(within(growth).getByText("₹49,990")).toBeVisible();
    expect(within(growth).getByText("₹299")).toBeVisible();
    expect(within(growth).getByText("25 GB")).toBeVisible();
    expect(within(growth).getByText("CRM, Quotes")).toBeVisible();
    expect(within(screen.getByRole("row", { name: /Demo/ })).getByText(words.notForSale)).toBeVisible();

    const archived = screen.getByRole("region", { name: words.archivedTitle });
    const row = within(archived).getByRole("row", { name: /Starter/ });
    expect(within(row).getByText(words.archived)).toBeVisible();
    expect(within(row).getAllByText(words.notSold)).not.toHaveLength(0);
    expect(within(row).getByText(words.coreOnly)).toBeVisible();
  });

  it("lists each plan with its figures on a phone", async () => {
    screenIs("phone");
    open({ data: [plan()] });
    const item = (await screen.findByText("Growth")).closest("li");
    expect(item).not.toBeNull();
    expect(within(item ?? document.body).getByText(/₹4,999/)).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lets a super admin create a plan, sending what the form holds as the api's input", async () => {
    screenIs("wide");
    const api = open({ data: [] });
    await userEvent.click(await screen.findByRole("button", { name: words.add }));
    const dialog = screen.getByRole("dialog", { name: form.createTitle });
    // Pasted, one event a field: typing key by key is slow on a busy machine.
    const fill = async (label: string, value: string) => {
      await userEvent.click(within(dialog).getByLabelText(label));
      await userEvent.paste(value);
    };
    await fill(form.key, "growth");
    await fill(form.name, "Growth");
    await fill(form.monthlyPrice, "4,999");
    await fill(form.seats, "10");
    await fill(form.whatsappNumbers, "2");
    await fill(form.storageGigabytes, "25");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: messages.consolePlatform.modules.crm }));
    api.answer("platform.plans.create", { data: plan() });
    api.answer("platform.plans.list", { data: [plan()] });
    await userEvent.click(within(dialog).getByRole("button", { name: form.create }));

    expect(await screen.findByText(words.created.replace("{name}", "Growth"))).toBeVisible();
    expect(inputsTo("plans.create")).toEqual([
      {
        key: "growth",
        name: "Growth",
        monthlyPricePaise: 499_900,
        yearlyPricePaise: null,
        extraSeatMonthlyPricePaise: null,
        extraSeatYearlyPricePaise: null,
        seatLimit: 10,
        whatsappNumberLimit: 2,
        storageLimitBytes: 25 * GIGABYTE,
        modules: ["crm"],
      },
    ]);
    expect(await screen.findByRole("row", { name: /Growth/ })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says what to fix before anything is sent", async () => {
    screenIs("wide");
    open({ data: [] });
    await userEvent.click(await screen.findByRole("button", { name: words.add }));
    const dialog = screen.getByRole("dialog", { name: form.createTitle });
    await userEvent.click(within(dialog).getByRole("button", { name: form.create }));
    expect(await within(dialog).findByText(form.problems.priceRequired)).toBeVisible();
    expect(within(dialog).getByText(form.problems.keyInvalid)).toBeVisible();
    expect(inputsTo("plans.create")).toEqual([]);
  });

  it("shows the api's sentence when a change is refused", async () => {
    screenIs("wide");
    const api = open({ data: [plan()] });
    await userEvent.click(await screen.findByRole("button", { name: words.actionsFor.replace("{name}", "Growth") }));
    await userEvent.click(screen.getByRole("menuitem", { name: words.edit }));
    const dialog = screen.getByRole("dialog", { name: form.editTitle.replace("{name}", "Growth") });
    expect(within(dialog).queryByLabelText(form.key)).toBeNull();
    await userEvent.clear(within(dialog).getByLabelText(form.yearlyPrice));
    api.answer("platform.plans.update", { status: 409, reason: "PLAN_CYCLE_IN_USE" });
    await userEvent.click(within(dialog).getByRole("button", { name: form.save }));
    expect(await within(dialog).findByText(messages.errors.reasons.PLAN_CYCLE_IN_USE)).toBeVisible();
    expect(inputsTo("plans.update")).toEqual([
      expect.objectContaining({ planId: plan().id, yearlyPricePaise: null, monthlyPricePaise: 499_900 }),
    ]);
  });

  it("archives a plan once the super admin confirms", async () => {
    screenIs("wide");
    const api = open({ data: [plan()] });
    await userEvent.click(await screen.findByRole("button", { name: words.actionsFor.replace("{name}", "Growth") }));
    await userEvent.click(screen.getByRole("menuitem", { name: words.archive }));
    const confirm = screen.getByRole("alertdialog", { name: words.archiveTitle.replace("{name}", "Growth") });
    api.answer("platform.plans.archive", { data: plan({ archived: true }) });
    await userEvent.click(within(confirm).getByRole("button", { name: words.archiveConfirm }));
    await vi.waitFor(() => {
      expect(inputsTo("plans.archive")).toEqual([{ planId: plan().id }]);
    });
  });

  it("never offers to archive the demo's own plan, which can't be", async () => {
    screenIs("wide");
    open({ data: [demo] });
    await userEvent.click(await screen.findByRole("button", { name: words.actionsFor.replace("{name}", "Demo") }));
    expect(screen.getByRole("menuitem", { name: words.edit })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: words.archive })).toBeNull();
  });

  it("shows support the plans read-only, and why", async () => {
    screenIs("wide");
    open({ data: [plan()] }, platformStaff("support"));
    expect(await screen.findByRole("row", { name: /Growth/ })).toBeVisible();
    expect(screen.getByText(words.readOnly)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.add })).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("says when there are no plans yet", async () => {
    screenIs("wide");
    open({ data: [] });
    expect(await screen.findByText(words.empty)).toBeVisible();
  });

  it("says when the plans didn't load, and loads them on Try again", async () => {
    screenIs("wide");
    const api = open({ status: 403 });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("platform.plans.list", { data: [plan()] });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("row", { name: /Growth/ })).toBeVisible();
  });
});
