// The caption under an import's title says its step (spec 3.2): "Step 2 of 4 · Match columns".
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { locale, messages } from "@/i18n/messages";

const captionOf = (status: Parameters<typeof ImportStepCaption>[0]["status"]) => {
  const { container, unmount } = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ImportStepCaption status={status} />
    </NextIntlClientProvider>,
  );
  const text = container.textContent;
  unmount();
  return text;
};

describe("ImportStepCaption", () => {
  it("captions each status with its step: Step 2 of 4 · Match columns", () => {
    expect(captionOf("uploading")).toBe("Step 1 of 4 · Choose a file");
    expect(captionOf("reading")).toBe("Step 1 of 4 · Choose a file");
    expect(captionOf("unreadable")).toBe("Step 1 of 4 · Choose a file");
    expect(captionOf("matching")).toBe("Step 2 of 4 · Match columns");
    expect(captionOf("checking")).toBe("Step 3 of 4 · Check before adding");
    expect(captionOf("checked")).toBe("Step 3 of 4 · Check before adding");
    for (const status of ["adding", "done", "stopped", "failed"] as const) {
      expect(captionOf(status)).toBe("Step 4 of 4 · Add");
    }
    expect(captionOf("cancelled")).toBe("");
    const shown = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ImportStepCaption status="matching" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Step 2 of 4 · Match columns")).toBeVisible();
    shown.unmount();
  });
});
