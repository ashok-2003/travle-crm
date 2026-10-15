// File sizes as people read them, in Indian English: whole bytes and KB, one decimal from MB up, 1,024 to the step.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatFileSize } from "@/files/file-size";

describe("formatFileSize", () => {
  it("names bytes, KB, MB and GB", () => {
    expect(formatFileSize(0)).toBe("0 bytes");
    expect(formatFileSize(1)).toBe("1 byte");
    expect(formatFileSize(512)).toBe("512 bytes");
    expect(formatFileSize(860 * 1024)).toBe("860 KB");
    expect(formatFileSize(1.2 * 1024 * 1024)).toBe("1.2 MB");
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(2.5 * 1024 ** 3)).toBe("2.5 GB");
  });

  it("rounds KB to whole numbers, and groups them the Indian way", () => {
    expect(formatFileSize(1500)).toBe("1 KB");
    expect(formatFileSize(1023 * 1024)).toBe("1,023 KB");
    expect(formatFileSize(1024 ** 4 * 3)).toBe("3,072 GB");
  });
});
