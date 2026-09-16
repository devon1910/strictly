/** OCR-only alternates. These are suggestions, never normalization rules. */
export interface ConfusableCandidate {
  label: string;
  result: string;
  reason: string;
  range: [number, number];
}

interface LowConfidenceWord {
  text: string;
  confidence: number;
}

/**
 * The table is intentionally small and symmetric. OCR engines do not expose a
 * reliable character-choice iterator, so alternatives are derived from this
 * table only at low-confidence positions.
 */
const CONFUSABLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "0": ["O"],
  O: ["0"],
  "1": ["l", "I"],
  l: ["1", "I"],
  I: ["1", "l"],
  "5": ["S"],
  S: ["5"],
  "8": ["B", "&"],
  B: ["8"],
  "&": ["8"],
  m: ["rn"],
  "–": ["-", "—"],
  "—": ["-", "–"],
  "-": ["–", "—"],
  "_": ["", " "],
  " ": ["_", ""],
  "=": ["-", "~"],
  "~": ["=", "-"],
  ".": [","],
  ",": ["."],
  ":": [";"],
  ";": [":"],
  "\u201c": ["\""],
  "\u201d": ["\""],
  '"': ["\u201c", "\u201d"],
  "\u2018": ["'"],
  "\u2019": ["'"],
  "'": ["\u2018", "\u2019"],
});

function entropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  return Array.from(counts.values()).reduce((sum, count) => {
    const probability = count / value.length;
    return sum - probability * Math.log2(probability);
  }, 0);
}

function isHighEntropy(value: string): boolean {
  if (value.length < 8) return false;
  const alphanumeric = value.replace(/[^A-Za-z0-9]/gu, "");
  const varied = new Set(alphanumeric.toLowerCase()).size >= Math.min(7, Math.ceil(alphanumeric.length * 0.45));
  return entropy(value) >= 2.5 && varied;
}

function eligibleRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const tokenPattern = /[A-Za-z0-9_~./:@?=&%+\-–—]{8,}/gu;
  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0] ?? "";
    const start = match.index ?? 0;
    if (isHighEntropy(token)) ranges.push([start, start + token.length]);
  }
  return ranges;
}

function positionIsLowConfidence(
  text: string,
  offset: number,
  words: readonly LowConfidenceWord[] | undefined,
  overallConfidence: number,
): boolean {
  if (!words || words.length === 0) return overallConfidence < 72;
  let cursor = 0;
  for (const word of words) {
    const position = text.indexOf(word.text, cursor);
    if (position < 0) continue;
    cursor = position + word.text.length;
    if (offset >= position && offset < position + word.text.length) return word.confidence < 72;
  }
  return overallConfidence < 72;
}

/**
 * Suggest only one-character confusable substitutions (plus rn/m and dropped
 * underscore/space candidates) when confidence is low inside a high-entropy
 * token. The input is returned untouched; each candidate is a full value.
 */
export function deriveConfusableCandidates(
  text: string,
  overallConfidence: number,
  words?: readonly LowConfidenceWord[],
): ConfusableCandidate[] {
  const ranges = eligibleRanges(text);
  const result: ConfusableCandidate[] = [];
  const seen = new Set<string>();
  for (const [start, end] of ranges) {
    for (let position = start; position < end; position += 1) {
      const character = text[position];
      if (!character || !CONFUSABLES[character] || !positionIsLowConfidence(text, position, words, overallConfidence)) continue;
      for (const alternate of CONFUSABLES[character]) {
        const candidate = `${text.slice(0, position)}${alternate}${text.slice(position + 1)}`;
        if (candidate === text || seen.has(candidate)) continue;
        seen.add(candidate);
        result.push({
          label: `OCR alternate at ${position}: ${character || "(dropped)"} → ${alternate || "(dropped)"}`,
          result: candidate,
          reason: "Low-confidence OCR character in a high-entropy segment. Compare it with the screenshot before copying.",
          range: [position, position + 1],
        });
        // A long token can contain dozens of confusables. Keep the review
        // surface bounded and deterministic without pretending to rank them.
        if (result.length >= 24) return result;
      }
    }
  }
  return result;
}

export { CONFUSABLES, isHighEntropy };
