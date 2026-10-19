// A staff import walked through the api and the worker, as the browser takes it: the file to storage, the columns
// matched as the reader guessed them, the temporary passwords made here and sent 25 at a time, Add, and the wait for
// each step. For the tests that need the real flow (staff-imports.test.ts, staff-passwords-never-kept.test.ts).
import type { StartedImport } from "@travel-crm/contracts/imports";
import type { CookieJar } from "./cookie-jar.js";
import { eventually } from "./eventually.js";
import type { TestServer } from "./test-server.js";
import { dataOf, mutate, query } from "./trpc.js";

export interface StaffImportView {
  id: string;
  status: string;
  failureReason: string | null;
  columns: { position: number; header: string; field: string | null }[];
  valueMatches: { field: string; value: string; target: string | null }[];
  counts: { byPlan: Record<string, number> } | null;
  progress: { rowsToAdd: number };
  seats: { free: number | null };
  added: { rowNumber: number; memberId: string; name: string; username: string | null; email: string | null }[];
}

export const viewOf = (server: TestServer, jar: CookieJar, importId: string) =>
  query(server, "staffImports.get", jar, { importId }).then((response) => dataOf<StaffImportView>(response));

export const waitForStatus = (server: TestServer, jar: CookieJar, importId: string, status: string) =>
  eventually(
    () => viewOf(server, jar, importId),
    (view) => view.status === status,
    `the import to be ${status}`,
    30_000,
  );

/** Uploads the CSV through the presigned link, confirms it and waits for the reader: the import at "matching". */
export async function uploadStaffFile(server: TestServer, jar: CookieJar, csv: string): Promise<string> {
  const bytes = new TextEncoder().encode(csv);
  const started = await dataOf<StartedImport>(
    await mutate(
      server,
      "staffImports.start",
      { fileName: "team.csv", contentType: "text/csv", sizeBytes: bytes.length },
      jar,
    ),
  );
  const put = await fetch(started.upload.url, { method: "PUT", headers: started.upload.headers, body: bytes });
  if (!put.ok) throw new Error(`The upload failed with ${String(put.status)}`);
  await dataOf(await mutate(server, "staffImports.confirmUpload", { importId: started.importId }, jar));
  await waitForStatus(server, jar, started.importId, "matching");
  return started.importId;
}

/** Matches the columns as the reader guessed them and the Role values as it suggested, and waits for the preview. */
export async function matchAsGuessed(server: TestServer, jar: CookieJar, importId: string) {
  const view = await viewOf(server, jar, importId);
  await dataOf(
    await mutate(
      server,
      "staffImports.match",
      {
        importId,
        columns: view.columns.map((column) => ({ position: column.position, field: column.field })),
        values: view.valueMatches
          .filter((match) => match.field === "role")
          .map((match) => ({ field: "role", value: match.value, target: match.target })),
        defaults: { roleKey: null },
      },
      jar,
    ),
  );
  return waitForStatus(server, jar, importId, "checked");
}

/** Sends a password for each row, 25 at a time, like the browser; returns them by row number. */
export async function sendPasswords(
  server: TestServer,
  jar: CookieJar,
  importId: string,
  rowNumbers: readonly number[],
  passwordOf: (rowNumber: number) => string,
): Promise<void> {
  for (let start = 0; start < rowNumbers.length; start += 25) {
    const batch = rowNumbers.slice(start, start + 25);
    await dataOf(
      await mutate(
        server,
        "staffImports.setPasswords",
        { importId, passwords: batch.map((rowNumber) => ({ rowNumber, password: passwordOf(rowNumber) })) },
        jar,
      ),
    );
  }
}
