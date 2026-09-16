import type { Finding, Rule } from "../types";
import { ADONET_KEY_SET } from "../parser";
import { withBaseFinding } from "../utils";

function splitSegments(input: string): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  let start = 0;
  let quote: "'" | '"' | undefined;
  for (let index = 0; index <= input.length; index += 1) {
    const character = input[index];
    if ((character === "'" || character === '"') && input[index - 1] !== "\\") quote = quote === character ? undefined : quote ?? character;
    if (index === input.length || (character === ";" && !quote)) {
      result.push([start, index]);
      start = index + 1;
    }
  }
  return result;
}

export const adoNetRule: Rule = {
  code: "ado-net-structure",
  appliesTo: (_input, ctx) => ctx.format === "ado-net" && Boolean(ctx.adonet),
  check(input, ctx): Finding[] {
    if (!ctx.adonet) return [];
    const findings: Finding[] = [];
    const seen = new Map<string, number>();
    for (const pair of ctx.adonet.pairs) {
      const normalized = pair.key.trim().toLowerCase();
      if (!normalized) {
        findings.push(withBaseFinding(
          "ADONET_EMPTY_KEY",
          "error",
          "ADO.NET key is empty",
          "Every semicolon-delimited pair needs a non-empty key before '='.",
          { range: [pair.segmentStart, pair.segmentEnd], symptom: "The driver may ignore the option and use an unintended default." },
        ));
      }
      if (seen.has(normalized)) {
        findings.push(withBaseFinding(
          "ADONET_DUPLICATE_KEY",
          "warning",
          `Duplicate ADO.NET key '${pair.key}'`,
          "Drivers differ on whether the first or last duplicate wins; retain one explicit value.",
          { range: [pair.keyStart, pair.keyEnd] },
        ));
      } else seen.set(normalized, pair.keyStart);
      if (!ADONET_KEY_SET.has(normalized)) {
        findings.push(withBaseFinding(
          "ADONET_UNKNOWN_KEY",
          "warning",
          `Unknown ADO.NET key '${pair.key}'`,
          "Check the driver-specific spelling; key names are not interchangeable across providers.",
          { range: [pair.keyStart, pair.keyEnd] },
        ));
      }
      if (pair.key.trim().length !== pair.key.length) {
        findings.push(withBaseFinding(
          "ADONET_KEY_WHITESPACE",
          "info",
          `Whitespace around ADO.NET key '${pair.key}'`,
          "Whitespace around a key is accepted by some providers and rejected by others; keep formatting explicit.",
          { range: [pair.segmentStart, pair.keyEnd] },
        ));
      }
    }
    for (const [start, end] of splitSegments(input)) {
      const segment = input.slice(start, end).trim();
      if (!segment || segment.startsWith("#")) continue;
      if (!segment.includes("=")) {
        findings.push(withBaseFinding(
          "ADONET_MALFORMED_PAIR",
          "error",
          "ADO.NET segment is missing '='",
          "Semicolon-delimited ADO.NET strings require key=value pairs; a missing separator can shift all following options.",
          { range: [start, end], symptom: "The driver may reject the connection string or silently ignore later options." },
        ));
      }
    }
    let quote: "'" | '"' | undefined;
    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if ((character === "'" || character === '"') && input[index - 1] !== "\\") quote = quote === character ? undefined : quote ?? character;
    }
    if (quote) {
      const start = input.lastIndexOf(quote);
      findings.push(withBaseFinding(
        "ADONET_UNBALANCED_QUOTES",
        "error",
        "Unbalanced quotes in ADO.NET value",
        "A quoted ADO.NET value must close before the connection string ends; otherwise semicolons and equals signs are reinterpreted.",
        { range: [Math.max(start, 0), Math.max(start, 0) + 1], symptom: "The driver may reject the connection string or read a truncated password." },
      ));
    }
    return findings;
  },
};

export const adoNetRules: readonly Rule[] = [adoNetRule];
