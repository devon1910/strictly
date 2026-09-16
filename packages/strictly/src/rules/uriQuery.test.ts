import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("URI query rules", () => {
  it("detects malformed and duplicate query parameters", () => {
    const input = "postgresql://demo:pass@host/db?sslmode=require&sslmode=disable&bad";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "URI_DUPLICATE_QUERY_PARAMETER")).toBe(true);
    expect(findings.some((entry) => entry.code === "URI_MALFORMED_QUERY")).toBe(true);
    expect(input).toBe(snapshot);
  });

  it("reports a malformed percent escape and a near-miss option", () => {
    const input = "postgresql://demo:pass@host/db?sslmodee=require&options=%zz";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "URI_MISSPELLED_QUERY_PARAMETER")).toBe(true);
    expect(findings.some((entry) => entry.code === "URI_MALFORMED_PERCENT_ESCAPE")).toBe(true);
    expect(input).toBe(snapshot);
  });
});
