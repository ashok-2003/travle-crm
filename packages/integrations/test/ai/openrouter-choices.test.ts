// A request's own model and temperature (Try it's test chat): the model named replaces the feature's list, on the backup
// key too, and a temperature goes only when it is set, so every other call carries none.
import { describe, expect, it } from "vitest";
import { createOpenRouterModel, withBackupModel, type AiRequest } from "../../src/ai/index.js";

const KEY = "sk-or-secret-key-1234567890";
const request: AiRequest = { feature: "autopilot", messages: [{ role: "user", content: "Hello" }] };
const models = { autopilot: ["a/live", "a/fallback"] };

/** A fetch that answers each request in turn, keeping the bodies it was sent. */
function fakeFetch(...statuses: number[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = (_url, init) => {
    bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>);
    const status = statuses.shift() ?? 200;
    const reply = { model: bodies.at(-1)?.model, choices: [{ message: { content: "Hi" }, finish_reason: "stop" }] };
    return Promise.resolve(status === 200 ? new Response(JSON.stringify(reply)) : new Response("no", { status }));
  };
  return { fetcher, bodies };
}

describe("a request's own model and temperature", () => {
  it("asks only the model named, never the feature's list", async () => {
    const { fetcher, bodies } = fakeFetch(503);
    const model = createOpenRouterModel({ apiKey: KEY, models, fetch: fetcher });
    expect(await model.complete({ ...request, model: "google/gemini-3.5-flash" })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(bodies.map((body) => body.model)).toEqual(["google/gemini-3.5-flash"]);
  });

  it("has the backup key ask the same model", async () => {
    const first = fakeFetch(503);
    const backup = fakeFetch(200);
    const model = withBackupModel(
      createOpenRouterModel({ apiKey: KEY, models, fetch: first.fetcher }),
      createOpenRouterModel({ apiKey: `${KEY}-backup`, models: { autopilot: ["b/live"] }, fetch: backup.fetcher }),
    );
    expect(await model.complete({ ...request, model: "google/gemini-3.5-flash" })).toMatchObject({
      ok: true,
      model: "google/gemini-3.5-flash",
    });
    expect(backup.bodies.map((body) => body.model)).toEqual(["google/gemini-3.5-flash"]);
  });

  it("sends a temperature only when it is set", async () => {
    const { fetcher, bodies } = fakeFetch(200, 200);
    const model = createOpenRouterModel({ apiKey: KEY, models, fetch: fetcher });
    await model.complete({ ...request, temperature: 0.4 });
    await model.complete(request);
    expect(bodies[0]).toMatchObject({ model: "a/live", temperature: 0.4 });
    expect(bodies[1]).not.toHaveProperty("temperature");
  });
});
