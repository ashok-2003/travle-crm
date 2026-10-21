// An address no page has: the offline page's shape, with the page's one title, one sentence, and the way home as the
// one full-size button.
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import NotFound, { generateMetadata } from "@/app/not-found";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "common.notFound") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

const { notFound } = messages.common;

describe("the 404 page", () => {
  it("says the page doesn't exist and leads home", async () => {
    render(await NotFound());
    expect(screen.getByRole("heading", { level: 1, name: notFound.title })).toBeVisible();
    expect(screen.getByText(notFound.body)).toBeVisible();
    const home = screen.getByRole("link", { name: notFound.home });
    expect(home).toHaveAttribute("href", "/dashboard");
    expect(home).toHaveAttribute("data-size", "default");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("is titled as it says", async () => {
    expect(await generateMetadata()).toEqual({ title: notFound.title });
  });
});
