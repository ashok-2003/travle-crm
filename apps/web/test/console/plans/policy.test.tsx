// The subscription policy (spec 7.3, Q3): how long a trial lasts and how long an unpaid organization stays past due,
// then read-only. Every platform staff member sees it; a super admin changes it, checked before it is sent.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PolicySection } from "@/console/plans/policy-section";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "./render-console";

const { policy: words } = messages.consolePlatform;
const policy = { trialDays: 7, pastDueDays: 7, readOnlyDays: 14 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PolicySection", () => {
  it("shows support the policy, without a way to change it", async () => {
    screenIs("wide");
    stubApi({ "platform.plans.policy": { data: policy } });
    renderConsole(<PolicySection />, platformStaff("support"));
    const trial = (await screen.findByText(words.trialDays)).closest("div");
    expect(within(trial ?? document.body).getByText("7 days")).toBeVisible();
    const readOnly = screen.getByText(words.readOnlyDays).closest("div");
    expect(within(readOnly ?? document.body).getByText("14 days")).toBeVisible();
    expect(screen.queryByRole("button", { name: words.change })).toBeNull();
  });

  it("lets a super admin change it, and shows the new days", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.plans.policy": { data: policy } });
    renderConsole(<PolicySection />);
    await userEvent.click(await screen.findByRole("button", { name: words.change }));
    const dialog = screen.getByRole("dialog", { name: words.changeTitle });
    const pastDue = within(dialog).getByLabelText(words.pastDueDays);
    await userEvent.clear(pastDue);
    await userEvent.type(pastDue, "10");
    api.answer("platform.plans.setPolicy", { data: { ...policy, pastDueDays: 10 } });
    api.answer("platform.plans.policy", { data: { ...policy, pastDueDays: 10 } });
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.save }));
    expect(await screen.findByText(words.saved)).toBeVisible();
    expect(inputsTo("plans.setPolicy")).toEqual([{ trialDays: 7, pastDueDays: 10, readOnlyDays: 14 }]);
    expect(await screen.findByText("10 days")).toBeVisible();
  });

  it("says what to fix before anything is sent", async () => {
    screenIs("wide");
    stubApi({ "platform.plans.policy": { data: policy } });
    renderConsole(<PolicySection />);
    await userEvent.click(await screen.findByRole("button", { name: words.change }));
    const dialog = screen.getByRole("dialog", { name: words.changeTitle });
    const readOnly = within(dialog).getByLabelText(words.readOnlyDays);
    await userEvent.clear(readOnly);
    await userEvent.type(readOnly, "0");
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.save }));
    expect(await within(dialog).findByText(words.problems.readOnlyDays)).toBeVisible();
    expect(inputsTo("plans.setPolicy")).toEqual([]);
  });

  it("says when the policy didn't load, and loads it on Try again", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.plans.policy": { status: 403 } });
    renderConsole(<PolicySection />);
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("platform.plans.policy", { data: policy });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findAllByText("7 days")).toHaveLength(2);
  });
});
