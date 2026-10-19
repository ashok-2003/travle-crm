// /leads/import (spec 3.2 step 1): the explanation, the file's way to storage and then to the import's own address, the
// sample file, and the person's Recent imports with their badges, each linking to its page.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Upload from "@/files/upload";
import { messages } from "@/i18n/messages";
import { ChooseFileScreen } from "@/leads/import/choose-file-screen";
import { leadImportRoute, routes } from "@/lib/routes";
import { stubApi } from "../../support/api-stub";
import { routerCalls } from "../navigation";
import { inputsTo, renderScreen } from "../screen";
import { importId } from "./records";

const uploadFile = vi.hoisted(() => vi.fn<typeof Upload.uploadFile>());
vi.mock("@/files/upload", async (importOriginal) => ({ ...(await importOriginal<typeof Upload>()), uploadFile }));
vi.mock("next/navigation", () => import("../navigation"));

const words = messages.leads.import;
const signed = {
  url: "https://files.example/organizations/x/attachments/y",
  method: "PUT" as const,
  headers: { "content-type": "text/csv" },
  expiresAt: "2099-10-16T05:10:00.000Z",
};
const recent = [
  {
    id: importId,
    fileName: "enquiries-sept-2026.xlsx",
    createdAt: "2026-09-12T10:00:00.000Z",
    status: "done",
    rowsTotal: 873,
    rowsAdded: 842,
  },
  {
    id: "0199e7a0-0000-7000-8000-0000000000e2",
    fileName: "goa-leads.csv",
    createdAt: "2026-10-14T10:00:00.000Z",
    status: "checked",
    rowsTotal: 40,
    rowsAdded: 0,
  },
];

beforeEach(() => {
  uploadFile.mockReset();
  uploadFile.mockResolvedValue();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChooseFileScreen", () => {
  it("explains the import, uploads the file and opens the import's address", async () => {
    stubApi({
      "leadImports.recent": { data: [] },
      "leadImports.start": {
        data: { importId, attachmentId: "0199e7a0-0000-7000-8000-0000000000e3", upload: signed },
      },
      "leadImports.confirmUpload": { data: null },
    });
    renderScreen(<ChooseFileScreen />);
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByText(words.intro)).toBeVisible();
    expect(screen.getByText("Step 1 of 4 · Choose a file")).toBeVisible();
    expect(screen.getByRole("link", { name: messages.imports.file.sample })).toHaveAttribute(
      "href",
      "/samples/leads-sample.csv",
    );
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute("href", routes.leads);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    await userEvent.upload(input, new File(["Name,Phone\nAsha,98765 43210\n"], "enquiries-oct-2026.csv"));
    await waitFor(() => {
      expect(routerCalls.push).toHaveBeenCalledWith(leadImportRoute(importId));
    });
    expect(inputsTo("leadImports.start")).toEqual([
      { fileName: "enquiries-oct-2026.csv", contentType: "text/csv", sizeBytes: 28 },
    ]);
    expect(inputsTo("leadImports.confirmUpload")).toEqual([{ importId }]);
  });

  it("lists recent imports with their badges, each linking to its page", async () => {
    stubApi({ "leadImports.recent": { data: recent } });
    renderScreen(<ChooseFileScreen />);
    const section = await screen.findByRole("region", { name: messages.imports.recent.title });
    expect(within(section).getByRole("link", { name: "enquiries-sept-2026.xlsx" })).toHaveAttribute(
      "href",
      leadImportRoute(importId),
    );
    expect(within(section).getByText(messages.imports.statuses.done)).toBeVisible();
    expect(within(section).getByText(messages.imports.statuses.checked)).toBeVisible();
    expect(section).toHaveTextContent(/842 added/);
  });

  it("says when the recent imports didn't load, with Try again", async () => {
    stubApi({ "leadImports.recent": "offline" });
    renderScreen(<ChooseFileScreen />);
    expect(await screen.findByText(words.recentFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
