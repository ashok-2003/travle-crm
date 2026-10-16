// The browser's upload goes straight to storage (spec 9.2): a PUT to the presigned URL with exactly the headers it
// came with (but Content-Length, which a page may not set: the browser sends the file's size), progress as a
// fraction, and an answer read the way the files module means it: a 2xx, or a 412 to a retry after the first PUT
// arrived, is done; anything else is an UploadError with the status, 0 when storage was never reached.
import type { PresignedUploadOutput } from "@travel-crm/contracts/files";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadError, uploadFile } from "@/files/upload";

/** A stand-in for the browser's XMLHttpRequest: it records the request, and the test plays storage's part. */
class FakeRequest {
  static last: FakeRequest | undefined;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  aborted = false;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  /** As in a browser, after load, error and abort alike. */
  onloadend: (() => void) | null = null;

  constructor() {
    FakeRequest.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
    this.onloadend?.();
  }
  /** Storage answers. */
  answer(status: number) {
    this.status = status;
    this.onload?.();
    this.onloadend?.();
  }
  /** Storage can't be reached. */
  fail() {
    this.onerror?.();
    this.onloadend?.();
  }
}

const upload: PresignedUploadOutput = {
  url: "https://storage.example.in/bucket/org/attachment?X-Amz-Signature=abc",
  method: "PUT",
  headers: { "content-type": "image/png", "content-length": "5", "if-none-match": "*" },
  expiresAt: "2026-10-15T18:15:00.000Z",
};

const file = new Blob(["hello"], { type: "image/png" });

function sent(): FakeRequest {
  const request = FakeRequest.last;
  if (!request) throw new Error("nothing was sent");
  return request;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeRequest.last = undefined;
});

describe("uploadFile", () => {
  it("PUTs the file to the presigned URL with its headers, the browser sending the length", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const done = uploadFile(upload, file);
    expect(sent()).toMatchObject({ method: "PUT", url: upload.url, body: file });
    expect(sent().headers).toEqual({ "content-type": "image/png", "if-none-match": "*" });
    sent().answer(200);
    await expect(done).resolves.toBeUndefined();
  });

  it("reports progress as a fraction, and 1 once storage has the file", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const progress: number[] = [];
    const done = uploadFile(upload, file, { onProgress: (fraction) => progress.push(fraction) });
    sent().upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 5 });
    sent().upload.onprogress?.({ lengthComputable: false, loaded: 3, total: 0 });
    sent().answer(200);
    await done;
    expect(progress).toEqual([0.4, 1]);
  });

  it("counts a 412 as done: a retried PUT whose first try already arrived", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const done = uploadFile(upload, file);
    sent().answer(412);
    await expect(done).resolves.toBeUndefined();
  });

  it("fails with storage's status when it refuses, and with 0 when it can't be reached", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const refused = uploadFile(upload, file);
    sent().answer(403);
    await expect(refused).rejects.toEqual(expect.objectContaining({ name: "UploadError", status: 403 }));
    const unreachable = uploadFile(upload, file);
    sent().fail();
    const error: unknown = await unreachable.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).status).toBe(0);
  });

  it("stops when its signal says so, before or during the upload", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const stopping = new AbortController();
    const done = uploadFile(upload, file, { signal: stopping.signal });
    stopping.abort();
    expect(sent().aborted).toBe(true);
    await expect(done).rejects.toMatchObject({ name: "AbortError" });
    FakeRequest.last = undefined;
    await expect(uploadFile(upload, file, { signal: stopping.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeRequest.last).toBeUndefined();
  });

  it("stops listening to its signal once the upload ends, however it ends", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const stopping = new AbortController();
    const ended: FakeRequest[] = [];
    const arrived = uploadFile(upload, file, { signal: stopping.signal });
    ended.push(sent());
    sent().answer(200);
    await arrived;
    const refused = uploadFile(upload, file, { signal: stopping.signal });
    ended.push(sent());
    sent().answer(403);
    await refused.catch(() => undefined);
    const unreachable = uploadFile(upload, file, { signal: stopping.signal });
    ended.push(sent());
    sent().fail();
    await unreachable.catch(() => undefined);
    // A signal shared by several uploads is stopped later: none of the finished requests hears it.
    stopping.abort();
    expect(ended.map((request) => request.aborted)).toEqual([false, false, false]);
  });
});
