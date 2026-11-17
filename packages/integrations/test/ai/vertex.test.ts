// Gemini on Vertex AI (ruling R14): the adapter sends a service account's OAuth token as the bearer in place of a key,
// asked for on every request, and a token that can't be had is an unavailable answer that holds nothing of the failure.
// The token is minted for the cloud-platform scope, kept, and minted again five minutes before its hour is up.
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterModel, serviceAccountToken } from "../../src/ai/index.js";

const VERTEX = "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi";
const messages = [{ role: "user" as const, content: "Hello" }];
const answer = () =>
  new Response(JSON.stringify({ model: "google/gemini-3.8-flash", choices: [{ message: { content: "Hi" } }] }));

afterEach(() => {
  vi.useRealTimers();
});

describe("the AI adapter on Vertex AI", () => {
  it("sends a fresh token from the service account as the bearer on every request", async () => {
    const headers: Record<string, string>[] = [];
    const fetcher: typeof fetch = (_url, init) => {
      headers.push(init?.headers as Record<string, string>);
      return Promise.resolve(answer());
    };
    let minted = 0;
    const model = createOpenRouterModel({
      apiKey: () => Promise.resolve(`ya29.token-${String((minted += 1))}`),
      models: { sales_agent: ["google/gemini-3.8-flash"] },
      baseUrl: VERTEX,
      fetch: fetcher,
    });
    expect(model.configured).toBe(true);
    await model.complete({ feature: "sales_agent", messages });
    await model.complete({ feature: "sales_agent", messages });
    expect(headers.map((sent) => sent.authorization)).toEqual(["Bearer ya29.token-1", "Bearer ya29.token-2"]);
  });

  it("answers unavailable when no token can be had, with nothing of the failure and no request sent", async () => {
    let sent = 0;
    const model = createOpenRouterModel({
      apiKey: () => Promise.reject(new Error("invalid_grant: key agent@p.iam.gserviceaccount.com was deleted")),
      models: { sales_agent: ["google/gemini-3.8-flash"] },
      baseUrl: VERTEX,
      fetch: () => Promise.resolve(new Response(String((sent += 1)))),
    });
    expect(await model.complete({ feature: "sales_agent", messages })).toStrictEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(sent).toBe(0);
  });
});

describe("a service account's token", () => {
  it("is minted for the cloud-platform scope, kept, and minted again five minutes before it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-17T10:00:00Z") });
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const posts: { url: string; body: string }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      const asked = new Request(url, init);
      posts.push({ url: asked.url, body: await asked.text() });
      const token = { access_token: `ya29.token-${String(posts.length)}`, expires_in: 3600, token_type: "Bearer" };
      return Promise.resolve(Response.json(token));
    };
    const token = serviceAccountToken(
      { client_email: "agent@p.iam.gserviceaccount.com", private_key: privateKey },
      fetcher,
    );

    expect(await token()).toBe("ya29.token-1");
    vi.setSystemTime(new Date("2026-11-17T10:54:00Z"));
    expect(await token()).toBe("ya29.token-1");
    vi.setSystemTime(new Date("2026-11-17T10:56:00Z"));
    expect(await token()).toBe("ya29.token-2");

    expect(posts.map((post) => post.url)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://oauth2.googleapis.com/token",
    ]);
    const assertion = new URLSearchParams(posts[0]?.body).get("assertion") ?? "";
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1] ?? "", "base64url").toString()) as object;
    expect(claims).toMatchObject({
      iss: "agent@p.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/cloud-platform",
    });
  });
});
