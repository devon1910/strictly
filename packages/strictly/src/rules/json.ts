import type { ParseContext, Rule, Finding } from "../types";
import { withBaseFinding } from "../utils";

function looksLikeJson(input: string): boolean {
  const trimmed = input.trimStart();
  return (trimmed.startsWith("{") || trimmed.startsWith("[")) && /[}:,\]]/u.test(trimmed);
}

export const jsonPunctuationRule: Rule = {
  code: "json-punctuation",
  appliesTo: (input, ctx: ParseContext) => ctx.format === "json" && looksLikeJson(input),
  check(input): Finding[] {
    try {
      JSON.parse(input);
      return [];
    } catch {
      return [withBaseFinding(
        "JSON_MALFORMED_PUNCTUATION",
        "error",
        "JSON-like input has malformed punctuation",
        "Missing quotes, colons, commas, or closing brackets can change which connection value a configuration loader reads.",
        { range: [0, input.length], symptom: "The configuration loader may fail before the application attempts a connection." },
      )];
    }
  },
};
