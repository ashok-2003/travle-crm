// defineListener checks a payload before the handler sees it, so a malformed event fails instead of half-running.
import { describe, expect, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { defineListener, type DomainEvent, type ListenerContext } from "../../src/jobs/index.js";

/** A stand-in for a Zod schema: accepts { documentId: string } only. */
const documentIssued = {
  parse(value: unknown): { documentId: string } {
    if (typeof value === "object" && value !== null && "documentId" in value && typeof value.documentId === "string") {
      return { documentId: value.documentId };
    }
    throw new Error("Not a document.issued payload");
  },
};

const event = (payload: DomainEvent["payload"]): DomainEvent => ({
  id: "0199e7a0-0000-7000-8000-000000000001",
  organizationId: "0199e7a0-0000-7000-8000-0000000000aa",
  type: "document.issued",
  payload,
  occurredAt: new Date(),
});

const context: ListenerContext = {
  actor: systemActor("0199e7a0-0000-7000-8000-0000000000aa"),
  forOrg: () => Promise.reject(new Error("not used here")),
};

describe("defineListener", () => {
  it("hands the handler a checked, typed payload", async () => {
    const seen: string[] = [];
    const listener = defineListener({
      name: "documents.render-pdf",
      eventType: "document.issued",
      payload: documentIssued,
      handle: (issued) => {
        seen.push(issued.payload.documentId);
        return Promise.resolve();
      },
    });
    await listener.handle(event({ documentId: "d1" }), context);
    expect(seen).toEqual(["d1"]);
    expect(listener).toMatchObject({ name: "documents.render-pdf", eventType: "document.issued" });
  });

  it("fails on a malformed payload without running the handler", async () => {
    let ran = false;
    const listener = defineListener({
      name: "documents.render-pdf",
      eventType: "document.issued",
      payload: documentIssued,
      handle: () => {
        ran = true;
        return Promise.resolve();
      },
    });
    await expect(listener.handle(event({ document: 1 }), context)).rejects.toThrow("Not a document.issued payload");
    expect(ran).toBe(false);
  });

  it("refuses a name that is not <module>.<what it does>, since it names the job queue", () => {
    for (const name of ["render-pdf", "Documents.render", "documents.", "documents.render pdf"]) {
      expect(() =>
        defineListener({
          name,
          eventType: "document.issued",
          payload: documentIssued,
          handle: () => Promise.resolve(),
        }),
      ).toThrow(/Listener names look like/);
    }
  });

  it("refuses an event type that is not <entity>.<what happened>", () => {
    expect(() =>
      defineListener({ name: "x.y", eventType: "issued", payload: documentIssued, handle: () => Promise.resolve() }),
    ).toThrow(/Event types look like/);
  });
});
