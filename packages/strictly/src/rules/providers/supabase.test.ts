import { describe, expect, it } from "vitest";
import { lint } from "../../index";

describe("Supabase provider rules", () => {
  it("flags 5432 as informational session mode", () => {
    const input = "postgres://demo:synthetic@db.abcdefgh.supabase.co:5432/postgres";
    const snapshot = input;
    const finding = lint(input).findings.find((entry) => entry.code === "SUPABASE_SESSION_PORT");
    expect(finding?.severity).toBe("info");
    expect(input).toBe(snapshot);
  });

  it("recognizes a pooled host and warns on an unusual shape", () => {
    const input = "postgres://demo:synthetic@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    const snapshot = input;
    expect(lint(input).findings.some((entry) => entry.code === "SUPABASE_POOLER_ENDPOINT")).toBe(true);
    expect(input).toBe(snapshot);

    const unusual = input.replace("aws-0-us-east-1", "pooler");
    const unusualSnapshot = unusual;
    expect(lint(unusual).findings.some((entry) => entry.code === "SUPABASE_POOLER_HOST_SHAPE")).toBe(true);
    expect(unusual).toBe(unusualSnapshot);
  });
});
