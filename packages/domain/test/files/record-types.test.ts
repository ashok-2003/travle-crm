// Which record takes which files (spec 5): an import's file is CSV or .xlsx and nothing else is; an import's report
// and an export are the system's alone, made with storeGeneratedFile; and those short-lived files are the platform's to
// delete for good, while an issued document's PDF still goes only with its record.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { deleteRecordFiles, isShortLivedRecordType } from "../../src/files/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  bytes,
  createOrganization,
  createTestFiles,
  memberOf,
  passportUpload,
  ref,
  type TestFiles,
} from "./test-files.js";

const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const importId = "0199e7a0-0000-7000-8000-0000000000e1";

describe("which files a record takes", () => {
  let test: TestFiles;
  let platformDb: PlatformDatabase;
  let organizationId: string;

  beforeAll(async () => {
    test = createTestFiles();
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 1 });
    organizationId = await createOrganization(test);
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  it("takes only CSV and .xlsx for an import's file, and refuses both types elsewhere: CONTENT_TYPE_NOT_ALLOWED", async () => {
    const owner = memberOf(organizationId, "org-owner");
    const importFile = { recordType: "import_batch", recordId: importId, fileName: "enquiries.csv", sizeBytes: 9 };
    for (const contentType of ["text/csv", xlsx] as const) {
      await expect(
        test.files.requestUpload(owner, passportUpload({ ...importFile, contentType })),
      ).resolves.toMatchObject({
        attachment: { contentType, status: "pending" },
      });
    }
    const refused = { code: "VALIDATION", reason: "CONTENT_TYPE_NOT_ALLOWED" };
    await expect(
      test.files.requestUpload(owner, passportUpload({ ...importFile, contentType: "application/pdf" })),
    ).rejects.toMatchObject(refused);
    for (const recordType of ["lead", "organization"]) {
      for (const contentType of ["text/csv", xlsx] as const) {
        await expect(
          test.files.requestUpload(owner, passportUpload({ recordType, contentType })),
        ).rejects.toMatchObject(refused);
      }
    }
    // The server's own files keep to the same lists.
    await expect(
      test.files.storeGeneratedFile(systemActor(organizationId), {
        recordType: "lead",
        recordId: importId,
        fileName: "leads.csv",
        contentType: "text/csv",
        body: bytes("Name"),
      }),
    ).rejects.toMatchObject(refused);
  });

  it("refuses an import's file over 10 MB however it is asked for, while other files take 25 MB (D11)", async () => {
    const owner = memberOf(organizationId, "org-owner");
    const importFile = {
      recordType: "import_batch",
      recordId: importId,
      fileName: "big.csv",
      contentType: "text/csv" as const,
    };
    await expect(
      test.files.requestUpload(owner, passportUpload({ ...importFile, sizeBytes: 10 * 1024 * 1024 + 1 })),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "IMPORT_FILE_TOO_LARGE" });
    await expect(
      test.files.requestUpload(owner, passportUpload({ ...importFile, sizeBytes: 10 * 1024 * 1024 })),
    ).resolves.toMatchObject({ attachment: { status: "pending" } });
    await expect(
      test.files.requestUpload(owner, passportUpload({ recordType: "lead", sizeBytes: 20 * 1024 * 1024 })),
    ).resolves.toMatchObject({ attachment: { status: "pending" } });
  });

  it("refuses an upload under an import report or an export: SYSTEM_OWNED_FILE", async () => {
    const owner = memberOf(organizationId, "org-owner");
    for (const recordType of ["import_report", "data_export"]) {
      await expect(
        test.files.requestUpload(owner, passportUpload({ recordType, recordId: importId, contentType: "text/csv" })),
      ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SYSTEM_OWNED_FILE" });
      const made = await test.files.storeGeneratedFile(systemActor(organizationId), {
        recordType,
        recordId: importId,
        fileName: "report.xlsx",
        contentType: xlsx,
        body: bytes("PK"),
      });
      expect(made).toMatchObject({ status: "ready", contentType: xlsx });
      await expect(test.files.remove(owner, ref(made))).rejects.toMatchObject({
        code: "FORBIDDEN",
        reason: "SYSTEM_OWNED_FILE",
      });
    }
  });

  it("lets the platform delete an import report's or an export's files, still refusing an issued document's", async () => {
    expect(["import_batch", "import_report", "data_export"].every(isShortLivedRecordType)).toBe(true);
    expect(["lead", "issued_document", "organization"].some(isShortLivedRecordType)).toBe(false);
    const organization = await createOrganization(test, "Short-lived files");
    for (const recordType of ["import_report", "data_export"]) {
      await test.files.storeGeneratedFile(systemActor(organization), {
        recordType,
        recordId: importId,
        fileName: "file.csv",
        contentType: "text/csv",
        body: bytes("Name"),
      });
      const record = { organizationId: organization, recordType, recordId: importId };
      expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, record, new Date()))).toBe(1);
    }
    const issued = { organizationId: organization, recordType: "issued_document", recordId: importId };
    await expect(platformDb.transaction((tx) => deleteRecordFiles(tx, issued, new Date()))).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "SYSTEM_OWNED_FILE",
    });
  });
});
