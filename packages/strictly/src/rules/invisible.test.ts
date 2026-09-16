import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("invisible character rules", () => {
  const cases: Array<[string, string, string]> = [
    ["\u200b", "INVISIBLE_ZERO_WIDTH_SPACE", ""],
    ["\u200c", "INVISIBLE_ZERO_WIDTH_NON_JOINER", ""],
    ["\u200d", "INVISIBLE_ZERO_WIDTH_JOINER", ""],
    ["\ufeff", "INVISIBLE_BOM", ""],
    ["\u00ad", "INVISIBLE_SOFT_HYPHEN", ""],
    ["\u00a0", "INVISIBLE_NON_BREAKING_SPACE", " "],
    ["\u202f", "INVISIBLE_UNICODE_SPACE", " "],
    ["\u201c", "INVISIBLE_SMART_QUOTE", '"'],
    ["\u2014", "INVISIBLE_UNICODE_DASH", "-"],
  ];

  for (const [character, code, replacement] of cases) {
    it(`locates ${code}`, () => {
      const input = `postgresql://demo:synthetic@host/db${character}`;
      const snapshot = input;
      const finding = lint(input).findings.find((entry) => entry.code === code);
      expect(finding?.range).toEqual([input.length - 1, input.length]);
      expect(finding?.fix?.result).toBe(input.slice(0, -1) + replacement);
      expect(input).toBe(snapshot);
    });
  }

  it("reports tabs, CR and trailing whitespace without changing input", () => {
    const input = "DATABASE_URL=postgres://demo:synthetic@host/db\t\r\n";
    const snapshot = input;
    const findings = lint(input).findings;
    expect(findings.some((entry) => entry.code === "INVISIBLE_TAB")).toBe(true);
    expect(findings.some((entry) => entry.code === "INVISIBLE_CARRIAGE_RETURN")).toBe(true);
    expect(input).toBe(snapshot);
  });
});
