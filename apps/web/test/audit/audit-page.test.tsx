// /settings/audit is titled with its heading's message, and shows the audit log only to roles that may read it
// (audit:view); others read why it isn't there, and the api is never asked.
import { screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuditPage, { generateMetadata } from "@/app/(app)/settings/audit/page";
import { locale, messages } from "@/i18n/messages";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { newQueryClient, renderWithApi } from "../organization/api";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "audit") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/settings/audit", () => {
  it("is titled with its heading's message", async () => {
    expect(await generateMetadata()).toEqual({ title: messages.audit.title });
  });

  it("shows the audit log to a role that may read it", async () => {
    stubApi({ "audit.list": { data: { entries: [], nextCursor: null } } });
    renderWithApi(<AuditPage />, newQueryClient(), member({ permissions: ["audit:view"] }));
    expect(screen.getByRole("heading", { level: 1, name: messages.audit.title })).toBeVisible();
    expect(await screen.findByText(messages.audit.empty)).toBeVisible();
  });

  it("tells other roles it isn't for them, without asking the api", () => {
    const api = stubApi({});
    renderWithApi(<AuditPage />, newQueryClient(), member({ permissions: ["settings:manage"] }));
    expect(screen.getByText(messages.shell.session.noAccess)).toBeVisible();
    expect(screen.getByRole("link", { name: messages.shell.session.goHome })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(api.calls).toEqual([]);
  });
});
