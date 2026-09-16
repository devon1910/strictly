import type { Finding, ProposedFix, Severity } from "./types";

/** Build a complete proposed value without ever mutating the source string. */
export function makeFix(
  input: string,
  start: number,
  end: number,
  replacement: string,
  label: string,
  reason: string,
): ProposedFix {
  return {
    label,
    result: input.slice(0, start) + replacement + input.slice(end),
    reason,
  };
}

export function replaceOne(
  input: string,
  index: number,
  replacement: string,
  label: string,
  reason: string,
): ProposedFix {
  return makeFix(input, index, index + 1, replacement, label, reason);
}

export function withBaseFinding(
  code: string,
  severity: Severity,
  message: string,
  detail: string,
  extra: Omit<Finding, "code" | "severity" | "message" | "detail"> = {},
): Finding {
  return { code, severity, message, detail, ...extra };
}

export function isHex(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value);
}

export function asciiTrimEnd(value: string): string {
  return value.replace(/[ \t]+$/u, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function entropy(value: string): number {
  if (value.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (const character of value) frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  let result = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

export function offsetFinding(finding: Finding, offset: number, original: string, nestedInput: string): Finding {
  const range = finding.range ? ([finding.range[0] + offset, finding.range[1] + offset] as [number, number]) : undefined;
  let fix = finding.fix;
  if (fix) {
    const nestedResult = fix.result;
    fix = {
      ...fix,
      result: original.slice(0, offset) + nestedResult + original.slice(offset + nestedInput.length),
    };
  }
  return { ...finding, range, fix };
}

