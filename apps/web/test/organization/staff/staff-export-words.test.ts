// The staff export's Status column says what the Staff screen says (B52, D29): the file's words are the screen's.
import { staffExportStatusWords } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";

describe("the staff export's words", () => {
  it("are the Staff screen's", () => {
    expect(staffExportStatusWords.mustChangePassword).toBe(messages.staff.mustChangePassword);
  });
});
