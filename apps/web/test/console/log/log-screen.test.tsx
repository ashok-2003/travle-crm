// The platform log (spec 5, 7): newest first, a page at a time, each entry readable: what was done (a sentence, a
// readable fallback for an action the console doesn't know yet), who did it (the viewer as "You", other staff by name
// for super admins, who may list them, "Automatic" for the platform's own jobs), the organization it concerns (by
// its name, or by its code once deleted), what it was about, when, and what changed.
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogScreen } from "@/console/log/log-screen";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { messages } from "@/i18n/messages";
import { formatDay, formatTime } from "@/lib/format";
import { stubApi, type Answer } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const { log: words } = messages.consolePlatform;
const viewer = platformStaff("super-admin");
const arjun = "0199a000-0000-7000-8000-0000000000ae";
const organizationId = "0199a000-0000-7000-8000-000000000002";
const planId = "0199a000-0000-7000-8000-0000000000a1";

function entry(overrides: Partial<PlatformLogEntry> = {}): PlatformLogEntry {
  return {
    id: "0199a000-0000-7000-8000-0000000000c1",
    occurredAt: "2026-10-14T11:00:00.000Z",
    actorUserId: arjun,
    action: "plan.updated",
    targetType: "plan",
    targetId: planId,
    targetOrganizationId: null,
    before: { name: "Growth", monthlyPricePaise: 499_900 },
    after: { name: "Growth", monthlyPricePaise: 599_900 },
    ...overrides,
  };
}

const onboarded = entry({
  id: "0199a000-0000-7000-8000-0000000000c2",
  actorUserId: viewer.userId,
  action: "organization.onboarded",
  targetType: "organization",
  targetId: organizationId,
  targetOrganizationId: organizationId,
  before: null,
  after: { code: "SHARMA" },
});

const page = (entries: PlatformLogEntry[], nextCursor: string | null = null) => ({ data: { entries, nextCursor } });

function open(log: Answer, staff = viewer, organization: Answer = organizationAnswer) {
  const api = stubApi({
    "platform.log.list": log,
    "platform.platformStaff.list": {
      data: [
        {
          userId: arjun,
          name: "Arjun Nair",
          email: "arjun@platform.test",
          level: "support",
          mustChangePassword: false,
          twoFactorEnabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          removedAt: null,
        },
      ],
    },
    "platform.plans.list": { data: [{ id: planId, key: "growth", name: "Growth" }] },
    "platform.organizations.get": organization,
  });
  renderConsole(<LogScreen />, staff);
  return api;
}

const organizationAnswer: Answer = {
  data: {
    organization: { id: organizationId, name: "Sharma Travels", code: "SHARMA" },
    profile: null,
    subscription: null,
  },
};

const entryOf = async (what: string) =>
  within((await screen.findByText(what)).closest<HTMLElement>("[role=listitem]") ?? document.body);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LogScreen", () => {
  it("says what was done, by whom, about what, and when", async () => {
    open(
      page([
        entry(),
        onboarded,
        entry({
          id: "0199a000-0000-7000-8000-0000000000c3",
          actorUserId: null,
          action: "demo.reset",
          targetType: "organization",
          targetId: organizationId,
          before: null,
          after: null,
        }),
      ]),
    );
    const changed = await entryOf(words.actions.plan.updated);
    expect(await changed.findByText("Arjun Nair")).toBeVisible();
    expect(await changed.findByText("Growth")).toBeVisible();
    const at = new Date(entry().occurredAt);
    const when = `${formatDay(at, { timeZone: PLATFORM_TIME_ZONE })}, ${formatTime(at, { timeZone: PLATFORM_TIME_ZONE })}`;
    expect(changed.getByText(when)).toBeVisible();

    const onboarding = await entryOf(words.actions.organization.onboarded);
    expect(onboarding.getByText(words.you)).toBeVisible();
    expect(await onboarding.findByRole("link", { name: "Sharma Travels" })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}`,
    );
    expect((await entryOf(words.actions.demo.reset)).getByText(words.automatic)).toBeVisible();
  });

  it("shows what changed, field by field", async () => {
    open(page([entry()]));
    const changed = await entryOf(words.actions.plan.updated);
    await userEvent.click(changed.getByRole("button", { name: words.changes }));
    expect(changed.getByText(words.fields.monthlyPricePaise)).toBeVisible();
    expect(changed.getByText("₹4,999")).toBeVisible();
    expect(changed.getByText("₹5,999")).toBeVisible();
    expect(changed.queryByText(words.fields.name)).toBeNull();
    expect(changed.queryByText("monthlyPricePaise")).toBeNull();
    await userEvent.click(changed.getByRole("button", { name: words.hideChanges }));
    expect(changed.queryByText("₹4,999")).toBeNull();
  });

  it("reads a payment's stored fields as dates and rupees, not as stored", async () => {
    open(
      page([
        entry({
          action: "subscription.payment-recorded",
          before: { paidThrough: "2026-10-01", status: "past_due" },
          after: { paidOn: "2026-10-16", amountPaise: 29_500_000, paidThrough: "2026-11-16", status: "active" },
        }),
      ]),
    );
    const recorded = await entryOf(words.actions.subscription["payment-recorded"]);
    await userEvent.click(recorded.getByRole("button", { name: words.changes }));
    expect(recorded.getByText("16 Oct")).toBeVisible();
    expect(recorded.getByText("₹2,95,000")).toBeVisible();
    expect(recorded.getByText(words.fields.amountPaise)).toBeVisible();
    expect(recorded.queryByText(/amountPaise|2026-10-16|29500000|16\/10/)).toBeNull();
  });

  it("names other staff only for super admins: support sees platform staff", async () => {
    open(page([entry()]), platformStaff("support"));
    const changed = await entryOf(words.actions.plan.updated);
    expect(changed.getByText(words.platformStaff)).toBeVisible();
    await vi.waitFor(() => {
      expect(inputsTo("plans.list")).toHaveLength(1);
    });
    expect(inputsTo("platformStaff.list")).toEqual([]);
  });

  it("shows a deleted organization by the code its entry kept", async () => {
    open(
      page([entry({ ...onboarded, action: "organization.purged", before: { code: "SHARMA" }, after: { rows: 12 } })]),
      viewer,
      { status: 404, reason: "ORGANIZATION_NOT_FOUND" },
    );
    const purged = await entryOf(words.actions.organization.purged);
    expect(await purged.findByText(words.deletedOrganization.replace("{code}", "SHARMA"))).toBeVisible();
    expect(purged.queryByRole("link")).toBeNull();
  });

  it("reads an action the console doesn't know yet as recorded", async () => {
    open(page([entry({ action: "plan.renamed" })]));
    expect(await screen.findByText(words.unknownAction.replace("{action}", "plan.renamed"))).toBeVisible();
  });

  it("shows older entries below, asked for before the page's last one", async () => {
    const api = open(page([entry()], entry().id));
    await screen.findByText(words.actions.plan.updated);
    api.answer("platform.log.list", page([onboarded]));
    await userEvent.click(screen.getByRole("button", { name: words.showMore }));
    expect(await screen.findByText(words.actions.organization.onboarded)).toBeVisible();
    expect(screen.getByText(words.actions.plan.updated)).toBeVisible();
    expect(inputsTo("log.list")).toEqual([{ limit: 50 }, { limit: 50, before: entry().id }]);
    expect(screen.queryByRole("button", { name: words.showMore })).toBeNull();
  });

  it("asks only for the names of organizations it hasn't seen when showing more", async () => {
    const other = "0199a000-0000-7000-8000-000000000003";
    const api = open(page([onboarded], onboarded.id));
    await screen.findByText("Sharma Travels");
    api.answer(
      "platform.log.list",
      page([
        entry({ id: "0199a000-0000-7000-8000-0000000000c3", targetOrganizationId: other, targetType: "organization" }),
        entry({ id: "0199a000-0000-7000-8000-0000000000c4", targetOrganizationId: organizationId }),
      ]),
    );
    await userEvent.click(screen.getByRole("button", { name: words.showMore }));
    await vi.waitFor(() => {
      expect(inputsTo("organizations.get")).toEqual([{ organizationId }, { organizationId: other }]);
    });
  });

  it("says when an organization's name didn't load, other than by its being deleted", async () => {
    open(page([onboarded]), viewer, { status: 500, reason: "INTERNAL" });
    expect(await screen.findByText(words.nameFailed, { exact: false }, { timeout: 8000 })).toBeVisible();
    expect(screen.getByRole("link", { name: "SHARMA" })).toBeVisible();
  });

  it("says when nothing is recorded yet, and when the log didn't load", async () => {
    const api = open({ status: 403 });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("platform.log.list", page([]));
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText(words.empty)).toBeVisible();
  });
});
