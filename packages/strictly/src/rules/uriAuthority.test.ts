import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("URI authority rules", () => {
  it("detects missing host", () => {
    const input = "postgresql:///db";
    const snapshot = input;
    expect(lint(input).findings.some((entry) => entry.code === "URI_MISSING_HOST")).toBe(true);
    expect(input).toBe(snapshot);
  });

  it("detects unbalanced brackets and invalid ports", () => {
    const input = "postgresql://demo:pass@[2001:db8::1:5432/db";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "URI_UNBALANCED_BRACKETS")).toBe(true);
    expect(input).toBe(snapshot);

    const invalid = "postgresql://demo:pass@host:65536/db";
    const invalidSnapshot = invalid;
    expect(lint(invalid).findings.some((entry) => entry.code === "URI_INVALID_PORT")).toBe(true);
    expect(invalid).toBe(invalidSnapshot);
  });
});
