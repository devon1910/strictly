import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("URI scheme rules", () => {
  it("detects OCR whitespace between a database scheme and authority separator", () => {
    const input = "postgresql: //neondb_owner:pass@host/db";
    const result = lint(input);
    const finding = result.findings.find((item) => item.code === "URI_SCHEME_WHITESPACE");

    expect(finding?.fix?.result).toBe("postgresql://neondb_owner:pass@host/db");
    expect(result.input).toBe(input);
  });

  it("proposes a whitespace-free URI for OCR spacing at structural delimiters", () => {
    const input = "postgresql: //neondb_owner :pass@host/db?sslmode=require&channel_binding=require";
    const finding = lint(input).findings.find((item) => item.code === "URI_SCHEME_WHITESPACE");

    expect(finding?.fix?.result).toBe(
      "postgresql://neondb_owner:pass@host/db?sslmode=require&channel_binding=require",
    );
  });

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
