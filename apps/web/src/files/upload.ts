// Sends a file straight to storage (spec 9.2: file bytes never pass through the api): a PUT to the presigned URL
// with the headers it was signed with, so storage refuses a file of another type or size, or one that would replace
// a file already there. The files module's confirmation follows; a retried PUT answered 412 means the first arrived.
import type { PresignedUploadOutput } from "@travel-crm/contracts/files";

/** Storage refused the upload (its HTTP status), or couldn't be reached (0). */
export class UploadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status === 0 ? "Storage couldn't be reached" : `Storage refused the upload with ${String(status)}`);
    this.name = "UploadError";
    this.status = status;
  }
}

/**
 * Headers a page may not set (the Fetch standard's forbidden request headers): the browser sends Content-Length
 * itself, from the file's size, which is the size the URL was signed for.
 */
const SENT_BY_THE_BROWSER = new Set(["content-length"]);

/** 412: the URL refuses to replace a stored file (`if-none-match: *`), so a retry finds the first upload arrived. */
const ALREADY_THERE = 412;

/** PUTs file to the presigned URL with exactly its headers; 2xx or 412 (a retry after it arrived) resolves. */
export function uploadFile(
  upload: PresignedUploadOutput,
  file: Blob,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const { onProgress, signal } = options;
  /** The signal's own reason when it gave one (AbortController.abort's is an AbortError), else an AbortError. */
  const stopped = (): Error =>
    signal?.reason instanceof Error ? signal.reason : new DOMException("The upload was stopped", "AbortError");
  if (signal?.aborted) return Promise.reject(stopped());
  return new Promise((resolve, reject) => {
    // XMLHttpRequest, not fetch: only it reports an upload's progress in every browser.
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) {
      if (!SENT_BY_THE_BROWSER.has(name.toLowerCase())) request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      if ((request.status >= 200 && request.status < 300) || request.status === ALREADY_THERE) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new UploadError(request.status));
      }
    };
    request.onerror = () => {
      reject(new UploadError(0));
    };
    request.onabort = () => {
      reject(stopped());
    };
    signal?.addEventListener(
      "abort",
      () => {
        request.abort();
      },
      { once: true },
    );
    request.send(file);
  });
}
