// The lite agent's form: its docs make a form that parses, the schema the model sees explains every field, and a
// grounded agent's stored facts are never read as a lite chat's.
import { describe, expect, it } from "vitest";
import { liteIntentDocs, understandFieldDocs } from "../../src/ai/lite-docs.js";
import { liteFacts, liteIntents, understandForm, understandFormJsonSchema } from "../../src/ai/lite.js";

const example = (key: string): unknown => understandFieldDocs[key]?.example;

describe("the understand form", () => {
  it("the docs' examples make a form that parses", () => {
    const form = {
      intents: example("intents"),
      details: {
        package: example("details.package"),
        place: example("details.place"),
        date: example("details.date"),
        adults: example("details.adults"),
        children: example("details.children"),
        name: example("details.name"),
        pickup_city: example("details.pickup_city"),
        room: example("details.room"),
        pay_in_full: example("details.pay_in_full"),
      },
      open_to_other_trips: example("open_to_other_trips"),
      lookups: example("lookups"),
      language: example("language"),
      summary: example("summary"),
      score: {
        chance: example("score.chance"),
        label: example("score.label"),
        reasons: example("score.reasons"),
        looks_fake: example("score.looks_fake"),
        fake_why: example("score.fake_why"),
        standing: example("score.standing"),
        next_step: example("score.next_step"),
      },
    };
    const parsed = understandForm.safeParse(form);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it("every property in the JSON schema has a description and an example", () => {
    const missing: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (typeof node !== "object" || node === null) return;
      const schema = node as Record<string, unknown>;
      const properties = schema.properties;
      if (typeof properties === "object" && properties !== null) {
        for (const [name, child] of Object.entries(properties)) {
          const property = child as Record<string, unknown>;
          const described = typeof property.description === "string" && property.description.length > 0;
          const examples = property.examples;
          if (!described || !Array.isArray(examples) || examples.length < 1) missing.push(`${path}.${name}`);
          walk(property, `${path}.${name}`);
        }
      }
      if (schema.items !== undefined) walk(schema.items, `${path}[]`);
      if (Array.isArray(schema.anyOf)) for (const branch of schema.anyOf) walk(branch, path);
    };
    walk(understandFormJsonSchema, "form");
    expect(missing).toEqual([]);
  });

  it("every intent has a description and an example", () => {
    for (const intent of liteIntents) {
      expect(liteIntentDocs[intent].description.length).toBeGreaterThan(0);
      expect(liteIntentDocs[intent].example.length).toBeGreaterThan(0);
    }
  });
});

describe("liteFacts", () => {
  it("a grounded row is not a lite row", () => {
    expect(liteFacts.safeParse({ places: [] }).success).toBe(false);
    expect(liteFacts.parse({ agent: "lite" }).otherInARow).toBe(0);
  });

  it("defaults every field", () => {
    expect(liteFacts.parse({ agent: "lite" })).toMatchObject({
      packageId: null,
      notRun: [],
      asked: [],
      payInFull: false,
      language: "english",
      lastMove: null,
    });
  });
});
