import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("generic secret rules", () => {
  it("recognizes unambiguous provider prefixes without naming arbitrary providers", () => {
    const input = "TOKEN=ghp_syntheticExample123456789";
    const snapshot = input;
    const finding = lint(input).findings.find((entry) => entry.code === "SECRET_KNOWN_PREFIX");
    expect(finding?.message).toMatch(/GitHub/i);
    expect(input).toBe(snapshot);
  });

  it("checks hex identifiers and malformed UUID grouping", () => {
    const input = "HASH=0123456789abcdef0123456789abcdef\nID=01234567-89ab-cdef-0123-456789abcdef0";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "SECRET_HEX_IDENTIFIER")).toBe(true);
    expect(findings.some((entry) => entry.code === "SECRET_MALFORMED_UUID")).toBe(true);
    expect(input).toBe(snapshot);
  });

  it("does not call ordinary prose a secret", () => {
    const input = "A connection-notes path and ordinary words are not credentials.";
    const snapshot = input;
    expect(lint(input).findings).toHaveLength(0);
    expect(input).toBe(snapshot);
  });
});
