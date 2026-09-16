import { describe, expect, it } from "vitest";
import { getWrapCandidates } from "./wraps";

describe("OCR wrap candidates", () => {
  it("does not mutate a multiline result and offers explicit joins", () => {
    const input = "ep-example-a1-\npooler.us-east-2.aws.neon.tech";
    const candidates = getWrapCandidates(input);
    expect(input).toBe("ep-example-a1-\npooler.us-east-2.aws.neon.tech");
    expect(candidates.map((candidate) => candidate.result)).toEqual([
      "ep-example-a1-pooler.us-east-2.aws.neon.tech",
      "ep-example-a1pooler.us-east-2.aws.neon.tech",
    ]);
    expect(candidates.every((candidate) => candidate.joinAt === 14)).toBe(true);
  });

  it("returns no candidates for one line or terminal punctuation", () => {
    expect(getWrapCandidates("plain value")).toEqual([]);
    expect(getWrapCandidates("value;\nnext")).toHaveLength(1);
  });
});
