import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("strictly", () => ({
  lint: (input: string) => ({
    input,
    format: input.startsWith("postgresql://") ? "uri" : "unrecognized",
    confidence: input.startsWith("postgresql://") ? 1 : 0,
    findings: input.includes(" ") ? [{
    code: "URI_INTERNAL_WHITESPACE",
    severity: "error",
    message: "Whitespace inside a connection component",
    detail: "A copied space can change the value received by the driver.",
    range: [input.indexOf(" "), input.indexOf(" ") + 1],
    symptom: "password authentication failed",
    fix: {
      label: "Remove the inserted space",
      result: input.replace(" ", ""),
      reason: "The space is not part of this synthetic credential.",
    },
    }] : [],
  }),
}));

vi.mock("./intake/ocr", () => ({
  createOcrSource: () => ({
    id: "test-ocr",
    extract: vi.fn().mockResolvedValue({ text: "postgresql://demo:pass@host/db", confidence: 91 }),
    cancel: vi.fn(),
  }),
}));

describe("strictly web surface", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("keeps original intake separate from a proposed fix", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Original intake" }), "postgresql://demo:pass word@host/db");
    expect((screen.getByRole("textbox", { name: "Original intake" }) as HTMLTextAreaElement).value).toContain(" ");
    expect(screen.getByText("Proposed fix")).toBeInTheDocument();
    expect(screen.getByText("Not applied")).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "Editable working copy" }) as HTMLTextAreaElement).value).toContain(" ");
  });

  it("re-lints manual edits and clears state with reset", async () => {
    const user = userEvent.setup();
    render(<App />);
    const working = screen.getByLabelText("Editable working copy");
    await user.clear(working);
    await user.type(working, "clean");
    expect(screen.getByText("Working copy updated and re-linted.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Reset$/ }));
    expect(screen.getByRole("textbox", { name: "Original intake" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Editable working copy" })).toHaveValue("");
    expect(screen.getByText("State cleared. No value is retained by strictly.")).toBeInTheDocument();
  });

  it("copies exactly the selected version and names it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Original intake" }), "postgresql://demo:pass word@host/db");
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await user.click(screen.getByRole("radio", { name: /Remove the inserted space/ }));
    expect(screen.getByText("Selected: Remove the inserted space")).toBeInTheDocument();
    const copyButton = screen.getByRole("button", { name: "Copy selected version" });
    expect(copyButton).not.toBeDisabled();
    await user.click(copyButton);
    await waitFor(() => expect(clipboardSpy).toHaveBeenCalledWith(expect.not.stringContaining(" ")));
    expect(await screen.findByText("Copied Remove the inserted space exactly.")).toBeInTheDocument();
  });

  it("presents unrecognized input as a neutral successful outcome", async () => {
    const user = userEvent.setup();
    render(<App />);
    const working = screen.getByLabelText("Editable working copy");
    await user.clear(working);
    await user.type(working, "Meet me at 3:30 by the north entrance");
    expect(screen.getByRole("status")).toHaveTextContent(
      "No known format was recognized. Invisible and ambiguous characters were still checked",
    );
    expect(screen.queryByText(/failed to recognize/i)).not.toBeInTheDocument();
  });

  it("explains what happened after a screenshot upload and gives a next step", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Screenshot / OCR" }));
    const file = new File(["synthetic image"], "connection.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Choose screenshot"), file);
    expect(await screen.findByText("Text extracted — ready to review")).toBeInTheDocument();
    expect(screen.getByText(/connection\.png/)).toBeInTheDocument();
    expect(screen.getByText(/Next:/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been fixed or copied automatically/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Original intake" })).toHaveValue("postgresql://demo:pass@host/db");
  });
});
