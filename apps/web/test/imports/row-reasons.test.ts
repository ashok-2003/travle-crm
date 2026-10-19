// Every reason a row isn't added has its sentence on screen (imports.json's reasons), a Google Sheet's two in_crm ones
// among them (the Sheets sync): the preview and the report say the same.
import { rowReasonCodes } from "@travel-crm/contracts/imports";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";

describe("row reasons", () => {
  it("has a sentence for every reason code, a sheet's rows already in the CRM included", () => {
    const sentences: Record<string, string> = messages.imports.reasons;
    expect(rowReasonCodes.filter((code) => sentences[code] === undefined)).toEqual([]);
    expect(sentences.in_crm_open).toBe("Has an open lead with you");
    expect(sentences.in_crm_closed).toBe("Has a closed lead with you");
  });
});
