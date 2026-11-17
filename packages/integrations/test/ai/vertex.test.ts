// Gemini on Vertex AI (ruling R14): the adapter sends a service account's OAuth token as the bearer in place of a key,
// asked for once per call, and a token that can't be had is an unavailable answer that holds nothing of the failure. With
// the service account, input_audio's format goes as a MIME type, which is how Vertex reads it. The token is minted for the
// cloud-platform scope, kept, and minted again five minutes before its hour is up; a failure is logged by name and code.
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterModel, serviceAccountToken, type AiAudioFormat } from "../../src/ai/index.js";
import { createMemoryLogger } from "../../src/logging/index.js";

const VERTEX = "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi";
const messages = [{ role: "user" as const, content: "Hello" }];
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
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

  it("answers unavailable when no token can be had, asking once, with nothing of the failure and no request sent", async () => {
    let sent = 0;
    let asked = 0;
    const model = createOpenRouterModel({
      apiKey: () => {
        asked += 1;
        return Promise.reject(new Error("invalid_grant: key agent@p.iam.gserviceaccount.com was deleted"));
      },
      models: { sales_agent: ["google/gemini-3.8-flash", "google/gemini-3.8-pro"] },
      baseUrl: VERTEX,
      fetch: () => Promise.resolve(new Response(String((sent += 1)))),
    });
    expect(await model.complete({ feature: "sales_agent", messages })).toStrictEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(asked).toBe(1);
    expect(sent).toBe(0);
  });

  it("sends input_audio's format as its MIME type with the service account, and the short form with a key", async () => {
    const formats: unknown[] = [];
    const fetcher: typeof fetch = (_url, init) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        messages: { content: { input_audio?: { format: string } }[] }[];
      };
      formats.push(body.messages[0]?.content[1]?.input_audio?.format);
      return Promise.resolve(answer());
    };
    const withKey = (apiKey: string | (() => Promise<string>)) =>
      createOpenRouterModel({ apiKey, models: { sales_agent: ["m"] }, baseUrl: VERTEX, fetch: fetcher });
    const note = (format: AiAudioFormat) => ({
      feature: "sales_agent" as const,
      messages: [
        {
          role: "user" as const,
          content: "Listen",
          attachments: [{ type: "audio" as const, format, bytes: new Uint8Array([1]) }],
        },
      ],
    });
    const vertex = withKey(() => Promise.resolve("ya29.token"));
    for (const format of ["ogg", "mp3", "wav", "aac", "m4a"] as const) await vertex.complete(note(format));
    await withKey("AIza-key-0123456789").complete(note("ogg"));
    expect(formats).toEqual(["audio/ogg", "audio/mpeg", "audio/wav", "audio/aac", "audio/mp4", "ogg"]);
  });
});

describe("a service account's token", () => {
  it("is minted for the cloud-platform scope, kept, and minted again five minutes before it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-17T10:00:00Z") });
    const posts: { url: string; body: string }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      const asked = new Request(url, init);
      posts.push({ url: asked.url, body: await asked.text() });
      const token = { access_token: `ya29.token-${String(posts.length)}`, expires_in: 3600, token_type: "Bearer" };
      return Promise.resolve(Response.json(token));
    };
    const token = serviceAccountToken(
      { client_email: "agent@p.iam.gserviceaccount.com", private_key: privateKey },
      createMemoryLogger(),
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

  it("logs a failure to mint by the error's name and code alone, never the key, the token or Google's words", async () => {
    const logger = createMemoryLogger({ censor: false });
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        Response.json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, { status: 400 }),
      );
    const token = serviceAccountToken(
      { client_email: "agent@p.iam.gserviceaccount.com", private_key: privateKey },
      logger,
      fetcher,
    );
    await expect(token()).rejects.toThrow();
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: "warn",
      source: "vertex-token",
      errorName: expect.any(String) as string,
    });
    const line = JSON.stringify(logger.entries);
    for (const secret of ["PRIVATE KEY", "agent@", "Invalid JWT", "assertion"]) expect(line).not.toContain(secret);
  });
});
