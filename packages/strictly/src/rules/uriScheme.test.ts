import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("URI scheme rules", () => {
  it("does not guess when a known scheme lacks ://", () => {
    const input = "postgresql:/demo:pass@host/db";
    const snapshot = input;
    const result = lint(input);
    expect(result.format).toBe("unrecognized");
    expect(result.findings).toHaveLength(0);
    expect(input).toBe(snapshot);
  });

  it("does not guess from an unknown URI-like scheme", () => {
    const input = "customdb://demo:pass@host/db";
    const snapshot = input;
    const result = lint(input);
    expect(result.format).toBe("unrecognized");
    expect(result.findings).toHaveLength(0);
    expect(input).toBe(snapshot);
  });
});
