// ai.setAgentOn on the real router: while the agency's AI ("Use the AI", Settings, AI) is off, turning the agent on is
// refused with the reason the web app shows as its sentence, and the checklist names the step to do first.
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorDetails } from "../src/errors.js";
import { anAgency, callerOf, createHarness, type Harness } from "./forms-support.js";

describe("ai.setAgentOn while the agency's AI is off", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("is refused with AI_OFF, and the checklist starts with the AI's step, not done", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "inbox", "ai"] });
    const { caller } = callerOf(harness, { organizationId });
    const error = await caller.ai.setAgentOn({ on: true }).then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("CONFLICT");
    // What the error formatter puts in the response for the screen to translate.
    expect(errorDetails(error as TRPCError)).toEqual({ domainCode: "CONFLICT", reason: "AI_OFF" });
    const setup = await caller.ai.agentSetup();
    expect(setup).toMatchObject({ on: false, ready: false });
    expect(setup.steps[0]).toMatchObject({ key: "ai", done: false, optional: false });
  });
});
