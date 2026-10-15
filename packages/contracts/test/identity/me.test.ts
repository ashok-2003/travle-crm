// me.get's answer gives the organization's time zone as a real IANA name, so the web app's dates never meet one
// Intl can't use (spec 9.6). A bad stored zone fails the answer at the api, instead of every date on every screen.
import { describe, expect, it } from "vitest";
import { meOutput } from "../../src/identity/index.js";

const answer = (timeZone: string) => ({
  user: {
    id: "0199a000-0000-7000-8000-000000000001",
    name: "Asha",
    email: null,
    username: "asha",
    twoFactorEnabled: false,
  },
  impersonatedBy: null,
  isPlatformAdmin: false,
  organization: {
    id: "0199a000-0000-7000-8000-000000000002",
    name: "Sharma Travels",
    code: "SHARMA",
    requireTwoFactor: false,
    timeZone,
  },
  member: null,
  pendingStep: null,
});

describe("meOutput", () => {
  it("takes the organization's zone as an IANA name", () => {
    expect(meOutput.parse(answer("Asia/Kolkata")).organization?.timeZone).toBe("Asia/Kolkata");
  });

  it("refuses a zone Intl doesn't know", () => {
    for (const zone of ["India", "IST", "+05:30", "Asia/Nowhere"]) {
      expect(meOutput.safeParse(answer(zone)).success, zone).toBe(false);
    }
  });
});
