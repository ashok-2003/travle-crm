// Builds the documents module's surroundings on the test database: files on in-memory storage, a fake renderer that
// records what it was asked to render, the context the worker gives a listener, and logos to draw.
import { crc32, deflateSync } from "node:zlib";
import type { IssueDocumentInput } from "@travel-crm/contracts/documents";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import type { PdfInput, PdfTemplate } from "@travel-crm/integrations/pdf";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { createFiles, type Files } from "../../src/files/index.js";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";

export interface TestDocuments {
  db: Database;
  platform: PlatformClient;
  storage: MemoryStorage;
  files: Files;
  close(): Promise<void>;
}

export function createTestDocuments(): TestDocuments {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const platform = createPlatformClient(urls.platform);
  const storage = createMemoryStorage();
  return {
    db,
    platform,
    storage,
    files: createFiles({ db, storage }),
    close: async () => {
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

/** A new organization; its time zone is Asia/Kolkata unless given. */
export async function createOrganization(test: TestDocuments, timeZone?: string): Promise<string> {
  const id = await createTestOrganization(test.platform, "Documents agency");
  if (timeZone !== undefined) await test.platform.organization.update({ where: { id }, data: { timeZone } });
  return id;
}

export const quotation: IssueDocumentInput = {
  template: "sample",
  content: {
    title: "Quotation",
    recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
    rows: [{ description: "Andaman islands, 6 nights", amount: "₹12,50,000.00" }],
    totals: [{ label: "Total", amount: "₹12,50,000.00", emphasis: true }],
  },
  branding: { organizationName: "Sharma Holidays", accentColour: "#034f46", terms: "50% to book." },
};

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

/** The smallest valid logos: a 1x1 transparent PNG and a 1x1 grey JPEG. */
export const tinyPng = bytesOf(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
);
export const tinyJpeg = bytesOf(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////" +
    "////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
);

/** A real black PNG of this size, one bit a pixel: a few kilobytes however many pixels it holds (a bomb's shape). */
export function pngOfSize(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  // Width, height, bit depth 1, greyscale, then the default compression, filter and interlace.
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(1, 8);
  // Each row: its filter byte, then a bit for each pixel, all zero.
  const rows = Buffer.alloc(height * (1 + Math.ceil(width / 8)));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = [signature, chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))];
  return new Uint8Array(Buffer.concat(png));
}

/** Stores a logo for the organization, as the branding screen's upload leaves it: ready, on the organization. */
export async function storedLogo(
  test: TestDocuments,
  organizationId: string,
  logo: { body: Uint8Array; contentType: string } = { body: tinyPng, contentType: "image/png" },
): Promise<string> {
  const attachment = await test.files.storeGeneratedFile(systemActor(organizationId), {
    recordType: "organization_logo",
    recordId: organizationId,
    fileName: "Logo.png",
    ...logo,
  });
  return attachment.id;
}

/** The document.issued event issuing wrote to the outbox, as the worker hands it to a listener. */
export async function issuedEvent(
  test: TestDocuments,
  organizationId: string,
  documentId: string,
): Promise<DomainEvent> {
  const row = await test.db.forOrg(organizationId, (tx) =>
    tx.outboxEvent.findFirstOrThrow({ where: { type: "document.issued", payload: { equals: { documentId } } } }),
  );
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    payload: { documentId },
    occurredAt: row.occurredAt,
  };
}

/** What the worker gives a listener: the system acting in the event's organization. */
export function listenerContext(test: TestDocuments, organizationId: string): ListenerContext {
  return { actor: systemActor(organizationId), forOrg: (fn) => test.db.forOrg(organizationId, fn) };
}

/** A renderer that records its calls and returns a few bytes, optionally waiting for a signal first. */
export function fakeRenderer(wait: Promise<void> = Promise.resolve()) {
  const calls: { template: PdfTemplate; input: PdfInput }[] = [];
  return {
    calls,
    render: async (template: PdfTemplate, input: PdfInput): Promise<Uint8Array> => {
      calls.push({ template, input });
      await wait;
      return new TextEncoder().encode(`%PDF-1.7 fake ${input.data.number}`);
    },
  };
}
