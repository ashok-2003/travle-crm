// The ready-made lines under the AI's instructions: a click adds one, once, and no line is offered that would pass the limit.
import { AI_INSTRUCTIONS_MAX } from "@travel-crm/contracts/ai";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstructionLines } from "@/ai/instruction-lines";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";

const line = messages.ai.settings.lines.dates;

describe("InstructionLines", () => {
  it("adds a line on its own line after what is written", async () => {
    const onChange = vi.fn();
    renderWithApi(
      <InstructionLines instructions="Reply in Hinglish." disabled={false} onChange={onChange} />,
      newQueryClient(),
    );
    await userEvent.click(screen.getByRole("button", { name: line }));
    expect(onChange).toHaveBeenCalledWith(`Reply in Hinglish.\n${line}`);
  });

  it("does not offer a line that is there already", () => {
    renderWithApi(<InstructionLines instructions={line} disabled={false} onChange={vi.fn()} />, newQueryClient());
    expect(screen.getByRole("button", { name: line })).toBeDisabled();
  });

  it("does not offer a line that would pass the limit", () => {
    renderWithApi(
      <InstructionLines instructions={"x".repeat(AI_INSTRUCTIONS_MAX - 5)} disabled={false} onChange={vi.fn()} />,
      newQueryClient(),
    );
    expect(screen.getByRole("button", { name: line })).toBeDisabled();
  });
});
