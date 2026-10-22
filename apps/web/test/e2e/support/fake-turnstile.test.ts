// The journeys' fake Turnstile, read by the api's real adapter exactly as the api reads Cloudflare: a good token passes
// once, a spent one is refused as a duplicate, a bad one is refused, and the fake's own trouble is "unreachable".
import { createTurnstileBotCheck } from "@travel-crm/integrations/bot-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startFakeTurnstile,
  turnstileScript,
  turnstileTokenFor,
  verifiedTokens,
  type FakeTurnstile,
} from "./fake-turnstile";

let fake: FakeTurnstile;
let check: ReturnType<typeof createTurnstileBotCheck>;

beforeAll(async () => {
  fake = await startFakeTurnstile();
  check = createTurnstileBotCheck({ secretKey: "test-secret", verifyUrl: fake.verifyUrl });
});

afterAll(async () => {
  await fake.stop();
});

describe("the fake Turnstile", () => {
  it("passes a good token once and refuses it the second time", async () => {
    const token = turnstileTokenFor("pass");
    expect(await check.verify({ token })).toBe("pass");
    expect(await check.verify({ token })).toBe("fail");
  });

  it("refuses a token made to fail", async () => {
    expect(await check.verify({ token: turnstileTokenFor("fail") })).toBe("fail");
  });

  it("is unreachable for a token made to error, so the enquiry is accepted", async () => {
    expect(await check.verify({ token: turnstileTokenFor("error") })).toBe("unreachable");
  });

  it("tells the journeys which tokens the api asked about", async () => {
    const token = turnstileTokenFor("pass");
    await check.verify({ token });
    expect(await verifiedTokens(fake.verifyUrl)).toContain(token);
  });

  it("stands in for the browser script: tokens that say how they will be judged, and a count of resets", () => {
    const script = turnstileScript("fail");
    expect(script).toContain('"fail" + "-"');
    expect(script).toContain("resets");
  });
});
