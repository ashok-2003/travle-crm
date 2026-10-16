// An organization's exports (spec 5, ADR 0023), a super admin's: each with its state, when it was asked for, finished
// and is kept until, and what it holds once done; asking for one; and downloading a done one through links that work
// for about 15 minutes. Support is told the screen is a super admin's; a deleted organization keeps its exports.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo } from "../plans/render-console";
import { anExport, openScreen, organizationId } from "./agency";

const { dataProtection: words } = messages.consolePlatform;

const itemOf = async (state: string) =>
  within((await screen.findByText(state)).closest("[role=listitem]") ?? document.body);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the organization's exports", () => {
  it("shows the organization, and each export's state and what it holds", async () => {
    openScreen({
      "platform.dataProtection.exports": {
        data: [anExport(), anExport({ exportId: "0199a000-0000-7000-8000-0000000000e2", state: "expired" })],
      },
    });
    expect(await screen.findByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(await screen.findByText("Sharma Travels")).toBeVisible();
    expect(screen.getByText("SHARMA")).toBeVisible();
    expect(screen.getByRole("link", { name: words.backToOrganization })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}`,
    );
    const ready = await itemOf(words.exports.states.done);
    expect(ready.getByText("3 parts")).toBeVisible();
    expect(ready.getByText("1,234 rows")).toBeVisible();
    expect(ready.getByText("4 people")).toBeVisible();
    expect(ready.getByText("2 files")).toBeVisible();
    expect(ready.getByRole("button", { name: words.exports.download })).toBeVisible();
    const expired = await itemOf(words.exports.states.expired);
    expect(expired.queryByRole("button")).toBeNull();
  });

  it("asks for an export of everything the organization keeps", async () => {
    const api = openScreen({});
    expect(await screen.findByText(words.exports.empty)).toBeVisible();
    api.answer("platform.dataProtection.exportOrganization", {
      data: anExport({ state: "requested", completedAt: null, parts: null, rows: null, people: null, files: null }),
    });
    api.answer("platform.dataProtection.exports", {
      data: [anExport({ state: "requested", completedAt: null, parts: null, rows: null, people: null, files: null })],
    });
    await userEvent.click(screen.getByRole("button", { name: words.exports.export }));
    expect(await screen.findByText(words.exports.asked)).toBeVisible();
    expect(inputsTo("dataProtection.exportOrganization")).toEqual([{ organizationId }]);
    expect(await screen.findByText(words.exports.states.requested)).toBeVisible();
  });

  it("downloads a done export through its short-lived links", async () => {
    const api = openScreen({ "platform.dataProtection.exports": { data: [anExport()] } });
    const ready = await itemOf(words.exports.states.done);
    api.answer("platform.dataProtection.downloadExport", {
      data: {
        exportId: anExport().exportId,
        linksExpireAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        parts: [{ part: 1, url: "https://storage.test/part-1" }],
        files: [{ fileId: "0199a000-0000-7000-8000-0000000000f1", url: "https://storage.test/file-1" }],
      },
    });
    await userEvent.click(ready.getByRole("button", { name: words.exports.download }));
    expect(await ready.findByRole("link", { name: words.exports.part.replace("{number}", "1") })).toHaveAttribute(
      "href",
      "https://storage.test/part-1",
    );
    expect(ready.getByRole("link", { name: /0199a000-0000-7000-8000-0000000000f1/ })).toHaveAttribute(
      "href",
      "https://storage.test/file-1",
    );
    expect(inputsTo("dataProtection.downloadExport")).toEqual([{ exportId: anExport().exportId }]);
  });

  it("tells support the screen is a super admin's, asking nothing of the api", async () => {
    openScreen({}, platformStaff("support"));
    expect(await screen.findByText(messages.errors.reasons.SUPER_ADMIN_ONLY)).toBeVisible();
    expect(inputsTo("dataProtection.exports")).toEqual([]);
    expect(inputsTo("organizations.get")).toEqual([]);
  });

  it("keeps a deleted organization's exports downloadable, and offers nothing else", async () => {
    openScreen({
      "platform.organizations.get": { status: 404, reason: "ORGANIZATION_NOT_FOUND" },
      "platform.dataProtection.exports": { data: [anExport()] },
    });
    expect(await screen.findByText(words.deleted)).toBeVisible();
    expect(await screen.findByRole("button", { name: words.exports.download })).toBeVisible();
    expect(screen.queryByRole("button", { name: words.purge.action })).toBeNull();
    expect(screen.queryByRole("button", { name: words.subject.export })).toBeNull();
  });
});
