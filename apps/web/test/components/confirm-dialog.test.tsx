// The shared confirmation (rule 7): anything more the person must do first sits in its body, and the action waits for
// it; while the request is out nothing closes the dialog; a refusal shows the api's sentence, or the section's own
// wording of it; the person's close forgets the refusal; a success is closed by the section's mutation options.
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { locale, messages } from "@/i18n/messages";
import { refusal as refused } from "../support/api-errors";

/** A section that owns the request and closes the dialog in the mutation's own options, as the hooks do. */
function Section({
  answer,
  typedCode,
  refusal,
}: {
  answer: () => Promise<void>;
  typedCode?: string;
  refusal?: (error: unknown) => string;
}) {
  const [open, setOpen] = useState(true);
  const [typed, setTyped] = useState("");
  const request = useMutation({
    mutationFn: answer,
    onSuccess: () => {
      setOpen(false);
    },
  });
  return (
    <>
      <p>{open ? "open" : "closed"}</p>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open again
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove the logo?"
        description="Documents issued from now on have no logo."
        action="Remove the logo"
        request={request}
        onConfirm={() => {
          request.mutate();
        }}
        confirmDisabled={typedCode !== undefined && typed !== typedCode}
        refusal={refusal}
      >
        {typedCode !== undefined && (
          <label>
            Type {typedCode}
            <input
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </label>
        )}
      </ConfirmDialog>
    </>
  );
}

function renderSection(props: Parameters<typeof Section>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <QueryClientProvider client={queryClient}>
        <Section {...props} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const action = () => screen.getByRole("button", { name: "Remove the logo" });

describe("ConfirmDialog", () => {
  it("waits for what its body asks before the action can be pressed", async () => {
    renderSection({ answer: () => Promise.resolve(), typedCode: "SHARMA" });
    expect(action()).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Type SHARMA"), "SHARMA");
    expect(action()).toBeEnabled();
    await userEvent.click(action());
    expect(await screen.findByText("closed")).toBeVisible();
  });

  it("stays open while the request is out, and the section's mutation options close it", async () => {
    let finish: () => void = () => undefined;
    renderSection({ answer: () => new Promise<void>((resolve) => (finish = resolve)) });
    await userEvent.click(action());
    expect(screen.getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    finish();
    expect(await screen.findByText("closed")).toBeVisible();
  });

  it("shows a refusal as the api's sentence, and the person's close lets go of it", async () => {
    renderSection({ answer: () => Promise.reject(refused(403, "MISSING_PERMISSION")) });
    await userEvent.click(action());
    expect(await screen.findByText(messages.errors.reasons.MISSING_PERMISSION)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: messages.common.cancel }));
    expect(await screen.findByText("closed")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Open again" }));
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    expect(screen.queryByText(messages.errors.reasons.MISSING_PERMISSION)).toBeNull();
  });

  it("words a refusal as the section asks", async () => {
    renderSection({
      answer: () => Promise.reject(refused(409, "EXPORT_FIRST")),
      refusal: () => "Export the organization's data first.",
    });
    await userEvent.click(action());
    expect(await screen.findByText("Export the organization's data first.")).toBeVisible();
  });
});
