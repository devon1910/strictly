import { describe, expect, it } from "vitest";
import { diffStrings, visibleCharacter } from "./diff";

describe("character diff", () => {
  it("keeps original and proposed characters separate", () => {
    expect(diffStrings("p@ss", "p%40ss")).toEqual([
      { kind: "same", value: "p" },
      { kind: "removed", value: "@" },
      { kind: "added", value: "%40" },
      { kind: "same", value: "ss" },
    ]);
  });

  it("renders sensitive whitespace with an accessible label", () => {
    expect(visibleCharacter(" ")).toEqual({ text: "·", label: "space" });
    expect(visibleCharacter("\u200b")).toEqual({ text: "⟦ZWSP⟧", label: "zero-width space" });
  });
});
