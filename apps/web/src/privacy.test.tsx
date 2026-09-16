import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("web privacy boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not call network, storage, logging or URL APIs during text inspection", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("network call from app");
    });
    const xhr = vi.fn(() => {
      throw new Error("XHR call from app");
    });
    vi.stubGlobal("XMLHttpRequest", xhr);
    const logs = ["log", "info", "warn", "error"].map((name) =>
      vi.spyOn(console, name as "log").mockImplementation(() => {
        throw new Error("console write from app");
      }),
    );
    const storageWrites = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write from app");
    });
    const urlWrites = vi.spyOn(history, "pushState").mockImplementation(() => {
      throw new Error("URL write from app");
    });

    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await user.click(screen.getByRole("tab", { name: "Paste text" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(storageWrites).not.toHaveBeenCalled();
    expect(urlWrites).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
