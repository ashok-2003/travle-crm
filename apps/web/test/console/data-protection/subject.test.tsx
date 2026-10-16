// One person's or one record's export and erasure (spec 5, DPDP; ADR 0023): a removed member by id, or a record of a
// person by type and id, checked by the api's own schema before anything is sent; the export shows what is kept
// about them, with short-lived file links; the erasure needs the organization's code typed, and its job's result
// comes from the platform log. Refusals show their sentences.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { inputsTo } from "../plans/render-console";
import { logged, openScreen, organizationId } from "./agency";

const { dataProtection: words } = messages.consolePlatform;
const memberId = "0199a000-0000-7000-8000-0000000000c9";

const subjectExport = {
  exportedAt: new Date().toISOString(),
  person: {
    memberId,
    userId: "0199a000-0000-7000-8000-0000000000ca",
    name: "Ravi Kumar",
    email: null,
    username: "ravi",
    role: "Sales",
    joinedAt: "2026-01-02T05:00:00.000Z",
    removedAt: "2026-10-01T05:00:00.000Z",
  },
  auditEntries: [{}, {}],
  files: [
    {
      id: "0199a000-0000-7000-8000-0000000000cb",
      recordType: "member",
      recordId: memberId,
      fileName: "passport.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      sensitive: true,
      deleted: false,
      downloadUrl: "https://storage.test/passport",
    },
  ],
};

async function paste(label: string, value: string) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(value);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("one person's or record's export and erasure", () => {
  it("exports what is kept about a removed member", async () => {
    const api = openScreen({});
    await screen.findByText("Sharma Travels");
    await paste(words.subject.memberId, memberId);
    api.answer("platform.dataProtection.exportSubject", { data: subjectExport });
    await userEvent.click(screen.getByRole("button", { name: words.subject.export }));
    expect(await screen.findByText("Ravi Kumar")).toBeVisible();
    expect(screen.getByText("ravi")).toBeVisible();
    expect(screen.getByText("2 audit entries")).toBeVisible();
    expect(screen.getByRole("link", { name: /passport\.pdf/ })).toHaveAttribute(
      "href",
      "https://storage.test/passport",
    );
    expect(inputsTo("dataProtection.exportSubject")).toEqual([
      { organizationId, subject: { kind: "member", memberId } },
    ]);
  });

  it("exports one record of a person by its type and id", async () => {
    const api = openScreen({});
    await screen.findByText("Sharma Travels");
    await userEvent.click(screen.getByRole("radio", { name: words.subject.record }));
    await paste(words.subject.recordType, "traveller");
    await paste(words.subject.recordId, memberId);
    api.answer("platform.dataProtection.exportSubject", { data: { ...subjectExport, person: null, files: [] } });
    await userEvent.click(screen.getByRole("button", { name: words.subject.export }));
    expect(await screen.findByText("2 audit entries")).toBeVisible();
    expect(inputsTo("dataProtection.exportSubject")).toEqual([
      { organizationId, subject: { kind: "record", recordType: "traveller", recordId: memberId } },
    ]);
  });

  it("says what an id looks like before anything is sent", async () => {
    openScreen({});
    await screen.findByText("Sharma Travels");
    await paste(words.subject.memberId, "ravi");
    await userEvent.click(screen.getByRole("button", { name: words.subject.export }));
    expect(await screen.findByText(words.subject.idInvalid)).toBeVisible();
    expect(inputsTo("dataProtection.exportSubject")).toEqual([]);
  });

  it("erases them once the code is typed, and shows the job's result", async () => {
    const api = openScreen({});
    await screen.findByText("Sharma Travels");
    await paste(words.subject.memberId, memberId);
    await userEvent.click(screen.getByRole("button", { name: words.subject.erase }));
    const confirm = within(screen.getByRole("alertdialog", { name: words.subject.eraseTitle }));
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    api.answer("platform.dataProtection.requestErasure", { data: { jobId: "0199a000-0000-7000-8000-0000000000ac" } });
    api.answer("platform.log.list", {
      data: {
        entries: [
          logged("subject.erased", { targetType: "member", targetId: memberId }),
          logged("subject.erasure-requested", { targetType: "member", targetId: memberId }),
        ],
        nextCursor: null,
      },
    });
    await userEvent.click(confirm.getByRole("button", { name: words.subject.confirmErase }));
    expect(await screen.findByText(words.subject.erased)).toBeVisible();
    expect(inputsTo("dataProtection.requestErasure")).toEqual([
      { organizationId, subject: { kind: "member", memberId }, confirmation: "SHARMA" },
    ]);
  });

  it("shows the api's sentence when an erasure is refused", async () => {
    const api = openScreen({});
    await screen.findByText("Sharma Travels");
    await paste(words.subject.memberId, memberId);
    await userEvent.click(screen.getByRole("button", { name: words.subject.erase }));
    const confirm = within(screen.getByRole("alertdialog", { name: words.subject.eraseTitle }));
    await userEvent.type(confirm.getByLabelText(words.confirmation.label.replace("{code}", "SHARMA")), "SHARMA");
    api.answer("platform.dataProtection.requestErasure", { status: 409, reason: "REMOVE_FIRST" });
    await userEvent.click(confirm.getByRole("button", { name: words.subject.confirmErase }));
    expect(await confirm.findByText(messages.errors.reasons.REMOVE_FIRST)).toBeVisible();
  });
});
