import { describe, expect, it } from "vitest";
import { lint } from "./index";

const NEGATIVE_FIXTURES = [
  "Meet me at 3:30 by the north entrance",
  String.raw`C:\Users\alex\Documents\notes.txt`,
  "/usr/local/bin/postgres",
  "alex@example.com",
  "See https://example.com/docs for details",
  "Kubernetes=hard;Docker=fine",
  "Supercalifragilisticexpialidocious",
];

describe("positive format classification", () => {
  it.each(NEGATIVE_FIXTURES)("keeps %j unrecognized and format-specific silent", (input) => {
    const snapshot = input;
    const result = lint(input);
    expect(result.input).toBe(input);
    expect(result.format).toBe("unrecognized");
    expect(result.confidence).toBe(0);
    expect(result.findings).toEqual([]);
    expect(input).toBe(snapshot);
  });

  it("still runs universal checks for unrecognized input", () => {
    const input = "ordinary prose\u200b";
    const result = lint(input);
    expect(result.format).toBe("unrecognized");
    expect(result.findings.map((finding) => finding.code)).toContain("INVISIBLE_ZERO_WIDTH_SPACE");
    expect(result.input).toBe(input);
  });

  it("positively identifies only strong structural formats", () => {
    expect(lint("postgresql://demo:pass@host/db").format).toBe("uri");
    expect(lint("DATABASE_URL=postgresql://demo:pass@host/db").format).toBe("env");
    expect(lint("Server=localhost;Database=sample;").format).toBe("ado-net");
    expect(lint("ghp_AbC1234567890SyntheticToken").format).toBe("secret");
  });
});
