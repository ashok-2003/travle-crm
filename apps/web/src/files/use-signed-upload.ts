"use client";

// Sending a file straight to storage (spec 9.2: file bytes never pass through the api), for a record's files and the
// logo alike: the api records the file and signs an upload (requestUpload), the browser PUTs the file to storage with
// its progress (uploadFile), then the api confirms it arrived (confirmUpload). It fails at once when offline rather
// than waiting at 0%, and can be stopped. Sending the same request again picks up where it stopped: once storage has
// the file only the confirmation is sent again (it is harmless to repeat), and before that the same signed upload while
// it lasts and storage hasn't refused it, so a retry doesn't leave another record behind. A stopped or abandoned upload
// leaves only a pending record, which nobody sees; a caller whose own record shows (an import) hears of the stop.
import type { PresignedUploadOutput } from "@travel-crm/contracts/files";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { UploadError, uploadFile } from "./upload";

/** What the api answers when asked to record a file and sign its upload. */
export interface SignedUpload {
  attachmentId: string;
  upload: PresignedUploadOutput;
}

/** How far a request got: the upload the api signed for it, and whether storage has the file. */
interface Progressed<Request> {
  request: Request;
  signed: SignedUpload;
  arrived: boolean;
}

/** An upload the person stopped: not a failure to report. */
export function wasStopped(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useSignedUpload<Request extends { file: File }, Confirmed>(calls: {
  requestUpload: (request: Request) => Promise<SignedUpload>;
  confirmUpload: (attachmentId: string) => Promise<Confirmed>;
  /** In the mutation's own options, so they run however the calling component is by then. */
  onSuccess?: (confirmed: Confirmed, request: Request) => void;
  /** The person stopped the upload of this signed file: its record is abandoned. */
  onStopped?: (attachmentId: string) => void;
  onSettled?: () => unknown;
}) {
  const [progress, setProgress] = useState(0);
  const stopper = useRef<AbortController | null>(null);
  /** The last request that didn't finish, for sending the same one again. */
  const unfinished = useRef<Progressed<Request> | null>(null);
  const upload = useMutation({
    networkMode: "always",
    mutationFn: async (request: Request) => {
      const controller = new AbortController();
      stopper.current = controller;
      const last = unfinished.current;
      let sent =
        last?.request === request && (last.arrived || Date.parse(last.signed.upload.expiresAt) > Date.now())
          ? last
          : null;
      if (!sent) {
        sent = { request, signed: await calls.requestUpload(request), arrived: false };
        unfinished.current = sent;
      }
      if (!sent.arrived) {
        setProgress(0);
        try {
          await uploadFile(sent.signed.upload, request.file, { onProgress: setProgress, signal: controller.signal });
        } catch (error) {
          // Storage refused the signed upload (expired by its clock, which may be ahead of this device's): the next
          // try signs a new one rather than being refused again.
          if (error instanceof UploadError && error.status !== 0) unfinished.current = null;
          throw error;
        }
        sent.arrived = true;
      }
      return calls.confirmUpload(sent.signed.attachmentId);
    },
    onSuccess: (confirmed, request) => {
      unfinished.current = null;
      calls.onSuccess?.(confirmed, request);
    },
    onError: (error, request) => {
      // The api signs the upload before storage is sent anything, so a stopped request always has its record.
      const signed = unfinished.current;
      if (wasStopped(error) && signed?.request === request) calls.onStopped?.(signed.signed.attachmentId);
    },
    onSettled: () => calls.onSettled?.(),
  });
  return {
    upload,
    /** How much of the file storage has, from 0 to 1. */
    progress,
    stop: () => {
      stopper.current?.abort();
    },
  };
}
