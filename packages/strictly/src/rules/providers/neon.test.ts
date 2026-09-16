import { describe, expect, it } from "vitest";
import { lint } from "../../index";

const direct = "postgresql://demo:AbC123dEf@ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech/db";

describe("Neon provider rules", () => {
  it("identifies direct endpoints without treating them as errors", () => {
    const input = direct;
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "NEON_DIRECT_ENDPOINT")).toBe(true);
    expect(findings.some((entry) => entry.severity === "error")).toBe(false);
    expect(input).toBe(snapshot);
  });

  it("uses exact anchors for near-miss Neon hosts", () => {
    const input = direct.replace("aws.neon.tech", "aws.ne0n.tech");
    const snapshot = input;
    const result = lint(input);
    expect(result.findings.some((entry) => entry.code.startsWith("NEON_"))).toBe(false);
    expect(input).toBe(snapshot);
  });

  it("checks the Neon query vocabulary", () => {
    const input = `${direct}?sslmod=require`;
    const snapshot = input;
    expect(lint(input).findings.some((entry) => entry.code === "NEON_UNKNOWN_QUERY_PARAMETER")).toBe(true);
    expect(input).toBe(snapshot);
  });
});
