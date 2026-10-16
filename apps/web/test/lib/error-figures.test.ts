// @vitest-environment node
// The refusals that name a limit say the api's own figures, so a limit changed in the contracts fails here until its
// sentence says the new one: the logo's pixels, and the samples an organization makes a day.
import { SAMPLES_PER_DAY } from "@travel-crm/contracts/documents";
import { MAX_LOGO_PIXELS, MAX_LOGO_SIDE_PIXELS } from "@travel-crm/contracts/profile";
import { describe, expect, it } from "vitest";
import errors from "@/i18n/messages/en-IN/errors.json";

describe("the figures in refusals", () => {
  it("LOGO_TOO_LARGE says the logo's limits", () => {
    expect(errors.reasons.LOGO_TOO_LARGE).toContain(`${String(MAX_LOGO_SIDE_PIXELS)} pixels`);
    expect(errors.reasons.LOGO_TOO_LARGE).toContain(`${String(MAX_LOGO_PIXELS / 1_000_000)} megapixels`);
  });

  it("SAMPLE_LIMIT_REACHED says how many samples a day", () => {
    expect(errors.reasons.SAMPLE_LIMIT_REACHED).toContain(`${String(SAMPLES_PER_DAY)} samples`);
  });
});
