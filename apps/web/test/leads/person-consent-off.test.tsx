// While marketing consent is switched off (website form spec 0.1.2) the lead's Owner and source card, where the consent
// line sits since the lead page's revamp, shows no consent line and asks the api nothing about it.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerCard } from "@/leads/lead/owner-card";
import { PersonConsent } from "@/leads/lead/person-consent";
import { stubApi } from "../support/api-stub";
import { aLead } from "./records";
import { renderScreen } from "./screen";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonConsent while the consent switch is off", () => {
  it("shows nothing on the lead's page and makes no call", async () => {
    const api = stubApi({
      "people.consent": { data: { state: "granted", at: "2026-10-22T05:00:00.000Z", fromForm: true } },
    });
    renderScreen(
      <OwnerCard lead={aLead()}>
        <PersonConsent leadId={aLead().id} personName="Rahul Sharma" />
      </OwnerCard>,
    );
    expect(await screen.findByText("Asha Sharma")).toBeVisible();
    expect(screen.queryByText(/Agreed to offers/)).not.toBeInTheDocument();
    expect(api.calls).not.toContain("people.consent");
  });
});
