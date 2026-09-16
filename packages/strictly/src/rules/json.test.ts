import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("JSON punctuation rule", () => {
  it("reports malformed JSON-like punctuation and accepts valid JSON", () => {
    const malformed = '{"DATABASE_URL" "postgres://demo:synthetic@host/db"}';
    const snapshot = malformed;
    expect(lint(malformed).findings.some((entry) => entry.code === "JSON_MALFORMED_PUNCTUATION")).toBe(true);
    expect(malformed).toBe(snapshot);

    const valid = '{"DATABASE_URL":"postgres://demo:synthetic@host/db"}';
    const validSnapshot = valid;
    expect(lint(valid).findings).toHaveLength(0);
    expect(valid).toBe(validSnapshot);
  });
});
