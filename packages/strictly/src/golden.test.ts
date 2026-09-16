import { describe, expect, it } from "vitest";
import { lint } from "./index";

const pooler = "ep-cool-darkness-a1b2c3d4-pooler.us-east-2.aws.neon.tech";
const direct = "ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech";

function unchanged(input: string, predicate: (findings: ReturnType<typeof lint>["findings"]) => void): void {
  const snapshot = input;
  const findings = lint(input).findings;
  predicate(findings);
  expect(input).toBe(snapshot);
}

describe("golden fixtures", () => {
  it("finds a copied space in a PostgreSQL password and proposes removal", () => {
    const input = `postgresql://alex:AbC1 23dEf@${pooler}/dbname?sslmode=require`;
    unchanged(input, (findings) => {
      const finding = findings.find((entry) => entry.code === "URI_INTERNAL_WHITESPACE");
      expect(finding?.range).toEqual([input.indexOf(" "), input.indexOf(" ") + 1]);
      expect(finding?.severity).toBe("error");
      expect(finding?.symptom).toMatch(/auth|password/i);
      expect(finding?.fix?.result).toBe(input.replace("AbC1 23dEf", "AbC123dEf"));
    });
  });

  it("finds the first unencoded password @ and proposes %40", () => {
    const input = `postgresql://alex:p@ssw0rd@${pooler}/dbname`;
    unchanged(input, (findings) => {
      const finding = findings.find((entry) => entry.code === "URI_UNENCODED_PASSWORD_CHAR");
      expect(finding?.range).toEqual([input.indexOf("@"), input.indexOf("@") + 1]);
      expect(finding?.detail).toMatch(/ssw0rd|host|encode/i);
      expect(finding?.fix?.result).toContain("p%40ssw0rd");
    });
  });

  it("keeps a valid direct Neon URI error-free while identifying endpoint intent", () => {
    const input = `postgresql://alex:AbC123dEf@${direct}/dbname?sslmode=require&channel_binding=require`;
    unchanged(input, (findings) => {
      expect(findings.filter((entry) => entry.severity === "error")).toHaveLength(0);
      expect(findings.some((entry) => entry.code === "NEON_DIRECT_ENDPOINT")).toBe(true);
    });
  });

  it("maps Supabase session-mode information through a dotenv assignment", () => {
    const input = 'DATABASE_URL="postgres://alex:AbC123dEf@db.abcdefgh.supabase.co:5432/postgres"';
    unchanged(input, (findings) => {
      const finding = findings.find((entry) => entry.code === "SUPABASE_SESSION_PORT");
      expect(finding?.severity).toBe("info");
      expect(finding?.range).toEqual([input.indexOf("5432"), input.indexOf("5432") + 4]);
      expect(findings.filter((entry) => entry.severity === "error")).toHaveLength(0);
    });
  });

  it("locates a zero-width space and keeps its removal proposed", () => {
    const input = `postgresql://alex:AbC123dEf@${pooler}/db\u200b`;
    unchanged(input, (findings) => {
      const finding = findings.find((entry) => entry.code === "INVISIBLE_ZERO_WIDTH_SPACE");
      expect(finding?.range).toEqual([input.indexOf("\u200b"), input.indexOf("\u200b") + 1]);
      expect(finding?.fix?.result).toBe(input.replace("\u200b", ""));
    });
  });

  it("reports Unicode punctuation, ADO.NET structure, and env offsets", () => {
    const inputs = [
      "postgresql://alex:AbC123dEf@ep–cool-darkness-a1b2c3d4-pooler.us-east-2.aws.neon.tech/db",
      "Server=localhost;Database=sample_db;User Id=alex;Password=synthetic-pass;",
      "DATABASE_URL=postgres://alex:AbC123dEf@db.abcdefgh.supabase.co:5432/postgres\n",
    ];
    for (const input of inputs) {
      const snapshot = input;
      expect(() => lint(input)).not.toThrow();
      expect(input).toBe(snapshot);
    }
  });
});
