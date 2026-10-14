// The sign-in relation guard must know every relation from an organization-owned model to a sign-in model, which the
// schema is read for here, and must let Json values through: an "organization" key inside one is data, not a relation.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SignInRelationError,
  signInModels,
  signInRelationCheck,
  signInRelations,
  type ModelDescriptions,
} from "../src/sign-in-guard.js";

const schemaFolder = path.resolve(import.meta.dirname, "../prisma/schema");

/** "Model.field" for each field of a model outside signInModels whose type is a sign-in model (T, T? or T[]). */
function relationsToSignInModels(schema: string): string[] {
  const found: string[] = [];
  for (const [, model = "", body = ""] of schema.matchAll(/^model[ \t]+(\w+)[ \t]*\{([\s\S]*?)^\}/gm)) {
    if (signInModels.includes(model)) continue;
    // A field line starts with its name and type; comments (///) and block attributes (@@) start otherwise.
    for (const [, field = "", type = ""] of body.matchAll(/^[ \t]*(\w+)[ \t]+(\w+)/gm)) {
      if (signInModels.includes(type)) found.push(`${model}.${field}`);
    }
  }
  return found;
}

async function readSchema(): Promise<string> {
  const files = (await readdir(schemaFolder)).filter((name) => name.endsWith(".prisma"));
  return (await Promise.all(files.map((name) => readFile(path.join(schemaFolder, name), "utf8")))).join("\n");
}

describe("relations to sign-in models", () => {
  it("are all named in signInRelations, so the guard refuses each of them", async () => {
    const relations = relationsToSignInModels(await readSchema());
    expect(relations).toEqual(
      expect.arrayContaining(["Role.organization", "RolePermission.organization", "OrgCounter.organization"]),
    );
    const unguarded = relations.filter((relation) => !signInRelations.includes(relation.split(".")[1] ?? ""));
    expect(unguarded, "add these relation names to signInRelations in src/sign-in-guard.ts").toEqual([]);
  });

  it("are found under any name, optional or a list", () => {
    const schema = [
      "model Lead {",
      "  id           String  @id",
      "  /// Who works the lead.",
      "  assignedTo   User?   @relation(fields: [assignedToId], references: [id])",
      "  watchers     User[]",
      "  organization Organization @relation(fields: [organizationId], references: [id])",
      '  @@map("lead")',
      "}",
    ].join("\n");
    expect(relationsToSignInModels(schema)).toEqual(["Lead.assignedTo", "Lead.watchers", "Lead.organization"]);
  });
});

describe("the sign-in relation check", () => {
  // Made-up models with Json columns: no real model has one yet.
  const models: ModelDescriptions = {
    Lead: {
      fields: [
        { name: "id", kind: "scalar", type: "String" },
        { name: "details", kind: "scalar", type: "Json" },
        { name: "organization", kind: "object", type: "Organization" },
        { name: "notes", kind: "object", type: "Note" },
        { name: "events", kind: "object", type: "Event" },
      ],
    },
    Note: {
      fields: [
        { name: "body", kind: "scalar", type: "Json" },
        { name: "organization", kind: "object", type: "Organization" },
      ],
    },
    // A Json column named like one of Prisma's arguments, as an event's payload might be.
    Event: {
      fields: [
        { name: "data", kind: "scalar", type: "Json" },
        { name: "organization", kind: "object", type: "Organization" },
      ],
    },
  };
  const check = signInRelationCheck(models);

  it("accepts a Json value with an organization key, on the model and through a relation", () => {
    expect(() => {
      check("Lead", { data: { details: { organization: "Sharma Travels", more: { organization: 1 } } } });
    }).not.toThrow();
    expect(() => {
      check("Lead", { where: { details: { equals: { organization: "Sharma Travels" } } } });
    }).not.toThrow();
    expect(() => {
      check("Lead", { data: { notes: { create: [{ body: { organization: "x" } }] } } });
    }).not.toThrow();
  });

  it("still refuses the organization relation, on the model and through a relation", () => {
    expect(() => {
      check("Lead", { data: { organization: { update: { name: "x" } } } });
    }).toThrow(SignInRelationError);
    expect(() => {
      check("Lead", { data: { notes: { create: { organization: { connect: { id: "x" } } } } } });
    }).toThrow(SignInRelationError);
    expect(() => {
      check("Lead", { include: { notes: { include: { organization: true } } } });
    }).toThrow(SignInRelationError);
    expect(() => {
      check("Lead", { where: { AND: [{ notes: { some: { organization: { name: "x" } } } }] } });
    }).toThrow(SignInRelationError);
  });

  it("never lets a Json column named like a Prisma argument hide a nested write", () => {
    expect(() => {
      check("Lead", {
        data: { events: { update: { where: { id: "x" }, data: { organization: { connect: { id: "y" } } } } } },
      });
    }).toThrow(SignInRelationError);
    // The price: such a column's own value is walked too, and refused if it has an organization key.
    expect(() => {
      check("Event", { data: { data: { organization: "x" } } });
    }).toThrow(SignInRelationError);
  });

  it("leaves queries on the sign-in models themselves alone", () => {
    expect(() => {
      check("Member", { include: { organization: true } });
    }).not.toThrow();
  });
});
