import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("ADO.NET key/value rules", () => {
  it("accepts a conventional key/value connection string", () => {
    const input = "Server=localhost;Database=sample_db;User Id=demo;Password=synthetic-pass;Ssl Mode=Require;";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "ADONET_MALFORMED_PAIR")).toBe(false);
    expect(input).toBe(snapshot);
  });

  it("detects malformed segments, duplicate keys, and quote imbalance", () => {
    const input = "Server=localhost;Database=sample;Database=other;Broken;Password=\"synthetic";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "ADONET_MALFORMED_PAIR")).toBe(true);
    expect(findings.some((entry) => entry.code === "ADONET_DUPLICATE_KEY")).toBe(true);
    expect(findings.some((entry) => entry.code === "ADONET_UNBALANCED_QUOTES")).toBe(true);
    expect(input).toBe(snapshot);
  });
});
