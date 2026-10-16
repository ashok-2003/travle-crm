// The business files screen keeps the agency's own papers on its organization record, the one record the api lets
// settings managers attach files to.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessFilesScreen } from "@/business/files/business-files-screen";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { inputsSentTo } from "./sent";

const words = messages.business.files;

describe("BusinessFilesScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the files of the member's own organization", async () => {
    stubApi({ "attachments.list": { data: [] } });
    const me = member({ isOwner: true });
    renderWithApi(<BusinessFilesScreen />, newQueryClient(), me);
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(await screen.findByText(words.empty)).toBeVisible();
    expect(inputsSentTo("attachments.list")).toEqual([{ recordType: "organization", recordId: me.organization.id }]);
  });
});
