import packageJson from "../package.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lint } from "./index";

/**
 * These are deliberately black-box tests.  The library's most important
 * promise is that linting is an observation, never an editing operation.
 * Keep the fixtures synthetic: they resemble connection strings without
 * containing credentials belonging to a real service.
 */
const neonPooler =
  "ep-cool-darkness-a1b2c3d4-pooler.us-east-2.aws.neon.tech";
const neonDirect = "ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech";

function errors(findings: ReturnType<typeof lint>["findings"]) {
  return findings.filter((finding) => finding.severity === "error");
}

function findingContaining(
  findings: ReturnType<typeof lint>["findings"],
  pattern: RegExp,
) {
  return findings.find(
    (finding) =>
      pattern.test(finding.code) ||
      pattern.test(finding.message) ||
      pattern.test(finding.detail),
  );
}

describe("strictly contract invariants", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ships with no runtime dependencies", () => {
    expect(Object.keys(packageJson.dependencies ?? {})).toHaveLength(0);
  });

  it("does not call network or console APIs while linting", () => {
    const forbidden = (api: string) => {
      throw new Error(`strictly must not call ${api}`);
    };

    vi.stubGlobal("fetch", vi.fn(() => forbidden("fetch")));
    vi.stubGlobal(
      "XMLHttpRequest",
      class ForbiddenXMLHttpRequest {
        constructor() {
          forbidden("XMLHttpRequest");
        }
      },
    );
    for (const method of ["debug", "info", "log", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation(() => forbidden(`console.${method}`));
    }

    expect(() => lint("plain synthetic text")).not.toThrow();
    expect(() => lint(`postgresql://demo:synthetic@${neonPooler}/sample`)).not.toThrow();
  });

  it("is deterministic and leaves every input byte unchanged", () => {
    const fixtures = [
      "plain synthetic prose with no secret",
      `postgresql://demo:AbC1 23dEf@${neonPooler}/sample?sslmode=require`,
      `postgresql://demo:p@ssw0rd@${neonPooler}/sample`,
      `postgresql://demo:AbC123dEf@${neonDirect}/sample?sslmode=require`,
      `postgresql://demo:AbC123dEf@${neonPooler}/sample\u200b`,
      "Server=localhost;Database=sample_db;User Id=demo;Password=synthetic-pass;",
      "DATABASE_URL=\"postgres://demo:synthetic@db.abcdefgh.supabase.co:5432/sample\"",
    ];

    for (const input of fixtures) {
      const snapshot = input;
      const first = lint(input);
      const second = lint(input);
      expect(input).toBe(snapshot);
      expect(first).toEqual(second);
      for (const finding of first.findings) {
        if (finding.fix) {
          // A proposed result is a separate complete value.  No fix may be
          // silently written over the caller's original input.
          expect(typeof finding.fix.result).toBe("string");
          expect(input).toBe(snapshot);
        }
      }
    }
  });

  it("reports the motivating password-space fixture with an exact range and separate fix", () => {
    const input =
      `postgresql://alex:AbC1 23dEf@${neonPooler}/dbname?sslmode=require`;
    const snapshot = input;
    const findings = lint(input).findings;
    const space = input.indexOf(" ");
    const finding = findingContaining(findings, /space|whitespace|password/i);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.range).toEqual([space, space + 1]);
    expect(finding?.symptom).toMatch(/auth|password/i);
    expect(finding?.fix).toBeDefined();
    expect(finding?.fix?.result).toBe(input.replace("AbC1 23dEf", "AbC123dEf"));
    expect(input).toBe(snapshot);
  });

  it("explains and proposes encoding for an unencoded @ in password", () => {
    const input = `postgresql://alex:p@ssw0rd@${neonPooler}/dbname`;
    const snapshot = input;
    const findings = lint(input).findings;
    const finding = findingContaining(findings, /UNENCODED.*PASSWORD|unencoded.*@|userinfo/i);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.range).toEqual([input.indexOf("@"), input.indexOf("@") + 1]);
    expect(finding?.detail).toMatch(/ssw0rd|host|encode/i);
    expect(finding?.fix?.result).toContain("p%40ssw0rd");
    expect(finding?.fix?.result).not.toBe(input);
    expect(input).toBe(snapshot);
  });

  it("keeps structural validity separate from endpoint correctness", () => {
    const input =
      `postgresql://alex:AbC123dEf@${neonDirect}/dbname?sslmode=require&channel_binding=require`;
    const findings = lint(input).findings;

    expect(errors(findings)).toHaveLength(0);
    expect(findings.some((finding) => finding.severity === "info")).toBe(true);
    expect(findings.some((finding) => /direct|pooler/i.test(`${finding.message} ${finding.detail}`))).toBe(
      true,
    );
  });

  it("maps an invisible-character finding to one UTF-16 code-unit and keeps removal proposed", () => {
    const input = `postgresql://alex:AbC123dEf@${neonPooler}/db\u200b`;
    const snapshot = input;
    const findings = lint(input).findings;
    const offset = input.indexOf("\u200b");
    const finding = findingContaining(findings, /zero.?width|invisible|U\+200B/i);

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.range).toEqual([offset, offset + 1]);
    expect(finding?.fix?.result).toBe(input.replace("\u200b", ""));
    expect(input).toBe(snapshot);
  });

  it("does not flag ordinary prose or filesystem paths as credentials", () => {
    expect(lint("The database connection is documented in docs/configuration.").findings).toHaveLength(0);
    expect(lint(String.raw`C:\\Users\\demo\\Documents\\connection-notes.txt`).findings).toHaveLength(0);
  });

  it("flags Supabase session mode as informational, not a structural failure", () => {
    const input = 'DATABASE_URL="postgres://demo:synthetic@db.abcdefgh.supabase.co:5432/sample"';
    const findings = lint(input).findings;
    const mode = findingContaining(findings, /5432|session mode|pooled port/i);

    expect(mode).toBeDefined();
    expect(mode?.severity).toBe("info");
    expect(errors(findings)).toHaveLength(0);
  });

  it("never proposes stripping spaces from quoted environment values", () => {
    const input = 'GREETING="synthetic value with intentional spaces"';
    const findings = lint(input).findings;
    expect(findings.every((finding) => !finding.fix || !/strip|remove.*space/i.test(finding.fix.reason))).toBe(
      true,
    );
  });
});
