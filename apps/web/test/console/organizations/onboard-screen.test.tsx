// Onboarding an agency (spec 7.1): the agency, its business profile, its Owner and a plan on sale, checked by the api's
// own schema before anything is sent (a GSTIN of another state among the refusals); success opens the organization's
// page, saying the invite went to the Owner; a refusal shows its sentence; with no plan on sale, the screen says where
// plans are made.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardScreen } from "@/console/organizations/onboarding/onboard-screen";
import { messages } from "@/i18n/messages";
import { stubApi, type Answer } from "../../support/api-stub";
import { chooseDay } from "../../support/choose-day";
import { inputsTo as inputsSentTo, renderConsole as renderConsoleScreen } from "../../support/render-console";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push, replace: vi.fn() }) }));

const { onboard } = messages.consoleOrganizations;

function plan(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: "0199a000-0000-7000-8000-0000000000c1",
    key: "growth",
    name: "Growth",
    monthlyPricePaise: 250_000,
    yearlyPricePaise: 2_500_000,
    extraSeatMonthlyPricePaise: null,
    extraSeatYearlyPricePaise: null,
    seatLimit: 10,
    whatsappNumberLimit: 1,
    storageLimitBytes: 10_000_000_000,
    modules: ["crm"],
    forSale: true,
    archived: false,
    ...overrides,
  };
}

const organizationId = "0199a000-0000-7000-8000-000000000002";

function renderOnboarding(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "platform.plans.list": {
      data: [plan(), plan({ id: "0199a000-0000-7000-8000-0000000000de", name: "Demo", forSale: false })],
    },
    "platform.plans.policy": { data: { trialDays: 7, pastDueDays: 7, readOnlyDays: 14 } },
    "platform.organizations.onboard": {
      data: { organizationId, code: "KERALA", ownerMemberId: "0199a000-0000-7000-8000-0000000000aa" },
    },
    ...answers,
  });
  renderConsoleScreen(<OnboardScreen />);
  return api;
}

async function choose(label: string, option: RegExp | string): Promise<void> {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/** Types into a field at once, as a paste: the form reads it the same way, and jsdom is slow at keystrokes. */
async function fill(label: string, text: string): Promise<void> {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(text);
}

/** Everything the form asks for, the usual trial left as it is. */
async function fillIn(): Promise<void> {
  await fill(onboard.agency.name, "Kerala Trails");
  await fill(onboard.agency.code, "kerala");
  await fill(onboard.agency.contactEmail, "hello@keralatrails.example");
  await fill(onboard.profile.legalName, "Kerala Trails LLP");
  await choose(onboard.profile.gstState, /Kerala/);
  await fill(onboard.owner.name, "Lakshmi Nair");
  await fill(onboard.owner.email, "lakshmi@keralatrails.example");
  await choose(onboard.subscription.plan, /Growth/);
}

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.push.mockReset();
});

// A long form with Radix selects: jsdom takes seconds over each journey through it, more on a busy machine.
describe("OnboardScreen", { timeout: 20_000 }, () => {
  it("offers the plans on sale by name, and their cycles with their prices once one is chosen", async () => {
    renderOnboarding();
    expect(await screen.findByRole("heading", { level: 1, name: onboard.title })).toBeVisible();
    await userEvent.click(await screen.findByRole("combobox", { name: onboard.subscription.plan }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Growth"]);
    await userEvent.click(options[0] ?? document.body);
    const cycle = screen.getByRole("radiogroup", { name: onboard.subscription.cycle });
    expect(within(cycle).getByRole("radio", { name: "Monthly, ₹2,500 before GST" })).toBeChecked();
    expect(within(cycle).getByRole("radio", { name: "Yearly, ₹25,000 before GST" })).not.toBeChecked();
    expect(screen.getByText("7 days, today the first")).toBeVisible();
  });

  it("onboards the agency and opens its page, saying the Owner's invite is on its way", async () => {
    renderOnboarding();
    await screen.findByRole("combobox", { name: onboard.subscription.plan });
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: onboard.submit }));
    await vi.waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith(`/console/organizations/${organizationId}?onboarded=1`);
    });
    expect(inputsSentTo("organizations.onboard")).toEqual([
      {
        name: "Kerala Trails",
        code: "KERALA",
        timeZone: "Asia/Kolkata",
        contactEmail: "hello@keralatrails.example",
        profile: {
          legalName: "Kerala Trails LLP",
          gstin: null,
          gstStateCode: "32",
          contactName: null,
          contactPhone: null,
        },
        owner: { name: "Lakshmi Nair", email: "lakshmi@keralatrails.example" },
        subscription: { planId: plan().id, billingCycle: "monthly", paidThrough: null },
      },
    ]);
  });

  it("takes the contact phone after its +91, mono", async () => {
    renderOnboarding();
    await screen.findByRole("combobox", { name: onboard.subscription.plan });
    const phone = screen.getByRole("textbox", { name: onboard.profile.contactPhone });
    expect(phone.closest("[data-slot=input-group]")).toHaveTextContent("+91");
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toHaveClass("numbers");
  });

  it("starts the subscription paid through a day when asked", async () => {
    renderOnboarding();
    await screen.findByRole("combobox", { name: onboard.subscription.plan });
    await fillIn();
    await userEvent.click(screen.getByRole("radio", { name: "Yearly, ₹25,000 before GST" }));
    await userEvent.click(screen.getByRole("radio", { name: onboard.subscription.starts.paid }));
    await chooseDay(onboard.subscription.paidThrough, "2027-03-31");
    await userEvent.click(screen.getByRole("button", { name: onboard.submit }));
    await vi.waitFor(() => {
      expect(navigation.push).toHaveBeenCalled();
    });
    expect(inputsSentTo("organizations.onboard")).toMatchObject([
      { subscription: { billingCycle: "yearly", trialEndsOn: null, paidThrough: "2027-03-31" } },
    ]);
  });

  it("refuses a GSTIN of another state before sending anything", async () => {
    const api = renderOnboarding();
    await screen.findByRole("combobox", { name: onboard.subscription.plan });
    await fillIn();
    await fill(onboard.profile.gstin, "27AAPFU0939F1ZV");
    await userEvent.click(screen.getByRole("button", { name: onboard.submit }));
    expect(await screen.findByText(onboard.problems.gstinOtherState)).toBeVisible();
    expect(api.calls).not.toContain("platform.organizations.onboard");
  });

  it("shows the api's refusal as a sentence, keeping what was typed", async () => {
    renderOnboarding({ "platform.organizations.onboard": { status: 409, reason: "ORGANIZATION_CODE_TAKEN" } });
    await screen.findByRole("combobox", { name: onboard.subscription.plan });
    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: onboard.submit }));
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_CODE_TAKEN)).toBeVisible();
    expect(screen.getByLabelText(onboard.agency.code)).toHaveValue("kerala");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("says when no plan is on sale, and where plans are made", async () => {
    renderOnboarding({ "platform.plans.list": { data: [plan({ forSale: false })] } });
    expect(await screen.findByText(onboard.subscription.noPlans)).toBeVisible();
    expect(screen.getByRole("link", { name: onboard.subscription.plansLink })).toHaveAttribute(
      "href",
      "/console/plans",
    );
    expect(screen.getByRole("button", { name: onboard.submit })).toBeDisabled();
  });

  it("says when the plans didn't load, and loads them on Try again", async () => {
    const api = renderOnboarding({ "platform.plans.list": { status: 403 } });
    expect(await screen.findByText(onboard.subscription.plansLoadFailed)).toBeVisible();
    api.answer("platform.plans.list", { data: [plan()] });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("combobox", { name: onboard.subscription.plan })).toBeVisible();
  });
});
