import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("environment variable rules", () => {
  it("supports bare, quoted, export, and multiline dotenv values", () => {
    const input = 'DATABASE_URL="postgres://demo:synthetic@db.abcdefgh.supabase.co:5432/postgres"\nexport REDIS_URL=redis://host:6379/0\nTOKEN="first\nsecond"';
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "SUPABASE_SESSION_PORT")).toBe(true);
    expect(findings.some((entry) => entry.code === "ENV_MULTILINE_VALUE")).toBe(true);
    expect(input).toBe(snapshot);
  });

  it("detects names, missing assignments, quotes, and style drift", () => {
    const input = "DATABASE URL=value\nDATABASEURL=value\nexport API_KEY=one\nOTHER=value\nBROKEN\nQUOTED=\"value";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "ENV_WHITESPACE_IN_NAME")).toBe(true);
    expect(findings.some((entry) => entry.code === "ENV_DROPPED_UNDERSCORE")).toBe(true);
    expect(findings.some((entry) => entry.code === "ENV_MALFORMED_ASSIGNMENT")).toBe(true);
    expect(findings.some((entry) => entry.code === "ENV_UNBALANCED_QUOTES")).toBe(true);
    expect(findings.some((entry) => entry.code === "ENV_MIXED_EXPORT_STYLE")).toBe(true);
    expect(input).toBe(snapshot);
  });

  it("does not propose stripping spaces from quoted values", () => {
    const input = 'GREETING="synthetic value"';
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.filter((entry) => entry.code === "ENV_QUOTED_SPACE")).toHaveLength(1);
    expect(findings.every((entry) => !entry.fix || !/remove.*space|strip.*space/i.test(entry.fix.reason))).toBe(true);
    expect(input).toBe(snapshot);
  });
});
