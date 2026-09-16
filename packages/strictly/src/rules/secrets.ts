import type { Finding, ParseContext, Rule } from "../types";
import { entropy, isHex, withBaseFinding } from "../utils";
import { isStrongSecretCandidate } from "../parser";

const KNOWN_PREFIXES: ReadonlyArray<{ prefix: string; provider: string }> = [
  { prefix: "npg_", provider: "Neon" },
  { prefix: "sk-", provider: "Stripe/OpenAI-style" },
  { prefix: "ghp_", provider: "GitHub" },
  { prefix: "AKIA", provider: "AWS access key" },
  { prefix: "xoxb-", provider: "Slack bot token" },
];

const SECRET_TOKEN = /[A-Za-z0-9][A-Za-z0-9_+./=-]{11,}/gu;
const UUID_SHAPED = /[A-Fa-f0-9-]{20,}/gu;
const CONFUSABLES = /[0OlI15S8B]/u;

function secretLike(value: string): boolean {
  if (value.length < 16) return false;
  const valueEntropy = entropy(value);
  const hasMixedClasses = /[a-z]/u.test(value) && /[A-Z]/u.test(value) && /\d/u.test(value);
  const hasDigitAndLetters = /[a-zA-Z]/u.test(value) && /\d/u.test(value);
  const punctuation = /[_+./=-]/u.test(value);
  // Paths and prose often have a slash or hyphen but lack the varied character
  // classes expected of a copied credential. Require digits/mixed case when
  // punctuation is the only unusual signal.
  return valueEntropy >= 3.15 && (hasMixedClasses || hasDigitAndLetters || (punctuation && /[A-Z\d]/u.test(value)) || valueEntropy >= 3.75 && !punctuation);
}

function rangeForMatch(input: string, match: RegExpMatchArray): [number, number] {
  const start = match.index ?? 0;
  return [start, start + match[0].length];
}

function isUriHostRange(range: [number, number], ctx: ParseContext): boolean {
  const uri = ctx.uri;
  if (!uri || uri.hostStart === undefined || uri.host === undefined) return false;
  // A token regex allows `/` so a hostname may be joined to its path. It is
  // still a hostname candidate when its first character lands in host range.
  return range[0] >= uri.hostStart && range[0] < uri.hostStart + uri.host.length;
}

export const genericSecretRule: Rule = {
  code: "generic-secret",
  appliesTo: (input, ctx) =>
    ctx.format === "secret" && isStrongSecretCandidate(input)
    || ctx.format === "env" && Boolean(ctx.env?.assignments.some((assignment) => isStrongSecretCandidate(assignment.value))),
  check(input, ctx): Finding[] {
    // RegExp#test with a global expression is stateful; reset before scanning.
    SECRET_TOKEN.lastIndex = 0;
    UUID_SHAPED.lastIndex = 0;
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const match of input.matchAll(SECRET_TOKEN)) {
      const rawToken = match[0];
      let token = rawToken;
      let range = rangeForMatch(input, match);
      // A dotenv/ADO assignment can be consumed as one token because '=' is a
      // legal base64 character. Keep the finding anchored to the value, not its
      // variable name, when the prefix before '=' looks like a key.
      const assignmentEquals = rawToken.indexOf("=");
      if (assignmentEquals > 0 && assignmentEquals < rawToken.length - 1 && /^[A-Za-z_][A-Za-z0-9_ .-]*$/u.test(rawToken.slice(0, assignmentEquals))) {
        token = rawToken.slice(assignmentEquals + 1);
        range = [range[0] + assignmentEquals + 1, range[1]];
      }
      // Provider hostnames are identifiers, not credentials. Inspecting them
      // creates the exact false positive that would obscure a direct-vs-pooled
      // endpoint info finding.
      if (isUriHostRange(range, ctx)) continue;
      const key = `${range[0]}:${range[1]}`;
      if (seen.has(key)) continue;
      const known = KNOWN_PREFIXES.find(({ prefix }) => token.includes(prefix));
      if (known) {
        const prefixOffset = token.indexOf(known.prefix);
        const knownRange: [number, number] = [range[0] + prefixOffset, range[1]];
        seen.add(key);
        findings.push(withBaseFinding(
          "SECRET_KNOWN_PREFIX",
          "warning",
          `Possible ${known.provider} credential identifier`,
          `The '${known.prefix}' prefix is unambiguous enough to identify a ${known.provider} token. Keep it local and rotate it if it was pasted into an untrusted tool.`,
          { range: knownRange },
        ));
        continue;
      }
      if (!secretLike(token)) continue;
      seen.add(key);
      findings.push(withBaseFinding(
        "SECRET_HIGH_ENTROPY",
        "info",
        "High-entropy identifier",
        "This long, varied token resembles a credential or identifier. Strictly does not name a provider unless its prefix is unambiguous.",
        { range },
      ));
      if (CONFUSABLES.test(token) && /[0OlI]/u.test(token)) {
        findings.push(withBaseFinding(
          "SECRET_OCR_CONFUSABLE",
          "warning",
          "Potential OCR-confusable character in identifier",
          "Characters such as 0/O and 1/l/I are easy to misread in a screenshot. Review this position against the source image; no alternate is applied automatically.",
          { range },
        ));
      }
    }
    for (const match of input.matchAll(UUID_SHAPED)) {
      const token = match[0];
      const range = rangeForMatch(input, match);
      if (isUriHostRange(range, ctx)) continue;
      if (!token.includes("-")) {
        if (token.length === 32 || token.length === 40 || token.length === 64) {
          findings.push(withBaseFinding(
            "SECRET_HEX_IDENTIFIER",
            "info",
            "Hex-only identifier",
            `A ${token.length}-character hex value resembles a hash or key. Its structure alone cannot prove what it is or whether it is correct.`,
            { range },
          ));
        }
        continue;
      }
      if (/^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/u.test(token)) continue;
      const hex = token.replace(/-/gu, "");
      if (hex.length >= 20 && isHex(hex)) {
        findings.push(withBaseFinding(
          "SECRET_MALFORMED_UUID",
          "warning",
          "UUID-like identifier has inconsistent grouping",
          "The token contains mostly hexadecimal characters but does not use canonical UUID groups; compare it with the source before using it.",
          { range },
        ));
      }
    }
    return findings;
  },
};
