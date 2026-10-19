// Choosing an import's file (spec 3.2 step 1, B2, B7): the file is checked first, then goes straight to storage with
// its progress and a way to stop, which cancels its import (X3); a failed upload is tried again without choosing the file again; the agency's full
// storage is refused with the files module's own sentence; and while the agency can't make changes the button is off
// and says why.
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Upload from "@/files/upload";
import { UploadError } from "@/files/upload";
import { messages } from "@/i18n/messages";
import { ImportFileStep } from "@/imports/import-file-step";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { member } from "../support/members";
import { renderAs } from "../organization/render";
import { refusal } from "../support/api-errors";

const uploadFile = vi.hoisted(() => vi.fn<typeof Upload.uploadFile>());
vi.mock("@/files/upload", async (importOriginal) => ({ ...(await importOriginal<typeof Upload>()), uploadFile }));

const words = messages.imports.file;
const importId = "0199e7a0-0000-7000-8000-0000000000d1";
const signed = {
  url: "https://files.example/organizations/x/attachments/y",
  method: "PUT" as const,
  headers: { "content-type": "text/csv" },
  expiresAt: "2099-10-16T05:10:00.000Z",
};
const started = { importId, attachmentId: "0199e7a0-0000-7000-8000-0000000000d2", upload: signed };
const csv = () =>
  new File(["Name,Phone\nAsha,98765 43210\n"], "enquiries-oct-2026.csv", { type: "application/vnd.ms-excel" });
const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  return input;
};

type FileStep = Parameters<typeof ImportFileStep>[0];

function step(calls: Partial<Pick<FileStep, "start" | "confirm" | "cancel" | "onUploaded">>) {
  return {
    start: vi.fn<FileStep["start"]>(calls.start ?? (() => Promise.resolve(started))),
    confirm: vi.fn<FileStep["confirm"]>(calls.confirm ?? (() => Promise.resolve(null))),
    cancel: vi.fn<FileStep["cancel"]>(calls.cancel ?? (() => Promise.resolve(null))),
    onUploaded: vi.fn<FileStep["onUploaded"]>(calls.onUploaded ?? (() => undefined)),
  };
}

beforeEach(() => {
  uploadFile.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImportFileStep", () => {
  it("uploads with its progress, stops and cancels its import, and tries again without choosing the file again", async () => {
    const calls = step({});
    let progressed: (fraction: number) => void = () => undefined;
    uploadFile.mockImplementationOnce(
      (_upload, _file, options) =>
        new Promise<void>((_resolve, reject) => {
          progressed = options?.onProgress ?? progressed;
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Stopped", "AbortError"));
          });
        }),
    );
    renderAs(<ImportFileStep maxRows={10_000} sampleHref="/samples/leads-sample.csv" {...calls} />);
    expect(screen.getByText(words.allowed.replace("{rows}", "10,000"))).toBeVisible();
    expect(screen.getByRole("link", { name: words.sample })).toHaveAttribute("href", "/samples/leads-sample.csv");
    await userEvent.upload(fileInput(), csv());
    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledTimes(1);
    });
    expect(calls.start).toHaveBeenCalledWith({
      fileName: "enquiries-oct-2026.csv",
      contentType: "text/csv",
      sizeBytes: 28,
    });
    act(() => {
      progressed(0.64);
    });
    expect(screen.getByText("64%")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.stop }));
    // Stopped is no failure to report: the person chose it. Trying again is choosing the file again.
    await waitFor(() => {
      expect(screen.queryByText("64%")).toBeNull();
    });
    // Its import goes too, rather than showing Uploading in Recent imports until it expires.
    expect(calls.cancel).toHaveBeenCalledWith(importId);

    uploadFile.mockRejectedValueOnce(new UploadError(0));
    await userEvent.upload(fileInput(), csv());
    expect(await screen.findByText(words.storageUnreachable)).toBeVisible();
    uploadFile.mockResolvedValueOnce();
    await userEvent.click(
      screen.getByRole("button", { name: words.tryAgainName.replace("{name}", "enquiries-oct-2026.csv") }),
    );
    await waitFor(() => {
      expect(calls.onUploaded).toHaveBeenCalledWith(importId);
    });
    expect(calls.confirm).toHaveBeenCalledWith(importId);
    expect(calls.cancel).toHaveBeenCalledTimes(1);
  });

  it("says to save an .xls file as .xlsx or CSV, and sends nothing", async () => {
    const calls = step({});
    renderAs(<ImportFileStep maxRows={500} sampleHref="/samples/staff-sample.csv" {...calls} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(fileInput(), new File(["x"], "old-notebook.xls", { type: "application/vnd.ms-excel" }));
    expect(screen.getByText(messages.imports.problems.old)).toBeVisible();
    expect(calls.start).not.toHaveBeenCalled();
  });

  it("shows the files module's own sentence when the agency's storage is full", async () => {
    const calls = step({ start: () => Promise.reject(refusal(403, "STORAGE_LIMIT_REACHED")) });
    renderAs(<ImportFileStep maxRows={10_000} sampleHref="/samples/leads-sample.csv" {...calls} />);
    await userEvent.upload(fileInput(), csv());
    expect(await screen.findByText(messages.errors.reasons.STORAGE_LIMIT_REACHED)).toBeVisible();
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("is off with its hint while the agency can't make changes", () => {
    renderWithApi(
      <ImportFileStep maxRows={10_000} sampleHref="/samples/leads-sample.csv" {...step({})} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
      member({ isOwner: true }),
    );
    const button = screen.getByRole("button", { name: words.choose });
    expect(button).toBeDisabled();
    expect(screen.getByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
  });
});
