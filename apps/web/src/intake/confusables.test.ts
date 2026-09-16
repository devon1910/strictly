import { describe, expect, it } from "vitest";
import { deriveConfusableCandidates, isHighEntropy } from "./confusables";

describe("OCR confusable suggestions", () => {
  it("only suggests alternates in low-confidence high-entropy text", () => {
    const input = "postgresql://alex:AbC1O23dEf@ep-cool-darkness-a1b2c3d4/db";
    expect(isHighEntropy("AbC1O23dEf")).toBe(true);
    const candidates = deriveConfusableCandidates(input, 55);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((candidate) => candidate.result.includes("AbC10"))).toBe(true);
    expect(input).toBe("postgresql://alex:AbC1O23dEf@ep-cool-darkness-a1b2c3d4/db");
  });

  it("does not generate noisy alternatives for confident or ordinary prose", () => {
    expect(deriveConfusableCandidates("The quick brown fox jumps over 10 dogs.", 40)).toEqual([]);
    expect(deriveConfusableCandidates("AbC1O23dEf", 92)).toEqual([]);
  });

  it("honours word-level confidence when available", () => {
    const input = "AbC1O23dEf";
    expect(deriveConfusableCandidates(input, 95, [{ text: input, confidence: 40 }]).length).toBeGreaterThan(0);
    expect(deriveConfusableCandidates(input, 40, [{ text: input, confidence: 95 }])).toEqual([]);
  });
});
