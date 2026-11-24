// The per-agency jobs' walk (spec 2026-11-22-multi-number-whatsapp-design.md, section 12): every organization with a
// routed number, once each however many numbers it has, page after page by id.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { routedOrganizationsPage } from "../../src/inbox/index.js";
import { aConnectedAgency, aSecondNumber, createTestInbox, type TestInbox } from "./support.js";

describe("the organizations with a routed number", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("lists an agency with two routed numbers once", async () => {
    const first = await aConnectedAgency(test);
    await aSecondNumber(test, first);
    const other = await aConnectedAgency(test);
    const walked: string[] = [];
    let after: string | undefined;
    for (;;) {
      // Pages of two, so the agency's two routes would straddle a page if the walk went by route.
      const page = await routedOrganizationsPage(test.db, { after, limit: 2 });
      walked.push(...page);
      if (page.length < 2) break;
      after = page.at(-1);
    }
    expect(walked.filter((id) => id === first.organizationId)).toHaveLength(1);
    expect(walked).toContain(other.organizationId);
    expect(walked).toEqual([...walked].sort());
    expect(new Set(walked).size).toBe(walked.length);
  });
});
