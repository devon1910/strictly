import type { Finding, ParseContext, Rule } from "../types";
import { replaceOne, withBaseFinding } from "../utils";

interface CharacterIssue {
  code: string;
  label: string;
  message: string;
  detail: string;
  replacement: string;
  severity: "error" | "warning";
  reason: string;
}

const knownIssues: Record<string, CharacterIssue> = {
  "\u200b": {
    code: "INVISIBLE_ZERO_WIDTH_SPACE",
    label: "Remove zero-width space",
    message: "Zero-width space in value",
    detail: "This character is not visible in most editors but changes the bytes sent to a driver.",
    replacement: "",
    severity: "error",
    reason: "The zero-width space is not part of the machine-sensitive value.",
  },
  "\u200c": {
    code: "INVISIBLE_ZERO_WIDTH_NON_JOINER",
    label: "Remove zero-width non-joiner",
    message: "Zero-width non-joiner in value",
    detail: "This invisible Unicode character can make a copied credential or hostname differ from the intended value.",
    replacement: "",
    severity: "error",
    reason: "The zero-width non-joiner is not part of the machine-sensitive value.",
  },
  "\u200d": {
    code: "INVISIBLE_ZERO_WIDTH_JOINER",
    label: "Remove zero-width joiner",
    message: "Zero-width joiner in value",
    detail: "This invisible Unicode character can make a copied credential or hostname differ from the intended value.",
    replacement: "",
    severity: "error",
    reason: "The zero-width joiner is not part of the machine-sensitive value.",
  },
  "\ufeff": {
    code: "INVISIBLE_BOM",
    label: "Remove byte-order mark",
    message: "Byte-order mark in value",
    detail: "A BOM copied from a document becomes a real character in the connection string.",
    replacement: "",
    severity: "error",
    reason: "The byte-order mark is metadata, not connection-string content.",
  },
  "\u00ad": {
    code: "INVISIBLE_SOFT_HYPHEN",
    label: "Remove soft hyphen",
    message: "Soft hyphen in value",
    detail: "Soft hyphens are formatting hints that can silently corrupt a hostname or secret when copied.",
    replacement: "",
    severity: "error",
    reason: "The soft hyphen is a formatting character and should not be sent to the driver.",
  },
  "\u00a0": {
    code: "INVISIBLE_NON_BREAKING_SPACE",
    label: "Normalize non-breaking space",
    message: "Non-breaking space in value",
    detail: "It looks like an ordinary space but has a different code point and is not accepted consistently by parsers.",
    replacement: " ",
    severity: "error",
    reason: "Normalize this visually ordinary space before deciding whether the value should contain a space.",
  },
  "\u202f": {
    code: "INVISIBLE_UNICODE_SPACE",
    label: "Normalize Unicode space",
    message: "Unicode space in value",
    detail: "This visually ordinary space is a different character from ASCII space and can break parsing.",
    replacement: " ",
    severity: "error",
    reason: "Normalize the Unicode space to ASCII so the character can be reviewed explicitly.",
  },
};

function unicodeSpace(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (code >= 0x2000 && code <= 0x200a) || code === 0x205f || code === 0x3000;
}

function smartQuote(character: string): CharacterIssue | undefined {
  if (!/[\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u201f]/u.test(character)) return undefined;
  const double = /[\u201c\u201d\u201e\u201f]/u.test(character);
  return {
    code: "INVISIBLE_SMART_QUOTE",
    label: "Replace smart quote",
    message: "Smart quote in machine-sensitive text",
    detail: "Document typography changed an ASCII quote into a Unicode quote; parsers and drivers may treat it as ordinary data.",
    replacement: double ? '"' : "'",
    severity: "warning",
    reason: "Use the ASCII quote expected by connection-string parsers.",
  };
}

function unicodeDash(character: string): CharacterIssue | undefined {
  const code = character.codePointAt(0) ?? 0;
  if (!((code >= 0x2010 && code <= 0x2015) || code === 0x2212 || code === 0x2043 || code === 0x2e3a || code === 0x2e3b)) return undefined;
  return {
    code: "INVISIBLE_UNICODE_DASH",
    label: "Replace Unicode dash",
    message: "Unicode dash in machine-sensitive text",
    detail: "A typographic dash is not the ASCII hyphen used in hostnames, schemes, and many secret formats.",
    replacement: "-",
    severity: "warning",
    reason: "Use an ASCII hyphen in machine-sensitive text.",
  };
}

function isControl(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 0 && code < 0x20 && character !== "\n" && character !== "\r" && character !== "\t") || (code >= 0x7f && code <= 0x9f);
}

function isAsciiExpected(ctx: ParseContext): boolean {
  return ctx.format === "uri" || ctx.format === "env" || ctx.format === "ado-net";
}

export const invisibleCharacterRule: Rule = {
  code: "invisible-characters",
  appliesTo: () => true,
  check(input: string, ctx: ParseContext): Finding[] {
    const findings: Finding[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      let issue: CharacterIssue | undefined = knownIssues[character];
      if (!issue && unicodeSpace(character)) issue = { ...knownIssues["\u202f"] };
      if (!issue) issue = smartQuote(character);
      if (!issue) issue = unicodeDash(character);
      if (!issue && character === "\r") {
        issue = {
          code: "INVISIBLE_CARRIAGE_RETURN",
          label: "Remove carriage return",
          message: "Stray carriage return",
          detail: "A CR copied from a Windows line ending can become part of a value and cause authentication or hostname failures.",
          replacement: "",
          severity: "error",
          reason: "Remove the carriage return; the visible line ending is represented by LF.",
        };
      }
      if (!issue && character === "\t") {
        issue = {
          code: "INVISIBLE_TAB",
          label: "Remove tab",
          message: "Tab character in value",
          detail: "Tabs are invisible in many views and are rarely valid inside a connection string or secret.",
          replacement: "",
          severity: "error",
          reason: "Remove the hidden tab and review the resulting characters explicitly.",
        };
      }
      if (!issue && (character === " " || character === "\t") && (index + 1 === input.length || input[index + 1] === "\n" || input[index + 1] === "\r")) {
        issue = {
          code: "INVISIBLE_TRAILING_WHITESPACE",
          label: "Remove trailing whitespace",
          message: "Trailing whitespace",
          detail: "Trailing whitespace is easy to copy accidentally and changes the value seen by a driver or shell.",
          replacement: "",
          severity: "warning",
          reason: "Remove whitespace at the end of this line.",
        };
      }
      if (!issue && isControl(character)) {
        issue = {
          code: "INVISIBLE_NON_PRINTABLE",
          label: "Remove non-printable character",
          message: "Non-printable character in value",
          detail: "Control characters can be rejected, truncated, or interpreted differently by shells and drivers.",
          replacement: "",
          severity: "error",
          reason: "Remove the control character and review the complete value before using it.",
        };
      }
      if (!issue && isAsciiExpected(ctx) && character.charCodeAt(0) > 0x7f) {
        issue = {
          code: "INVISIBLE_NON_ASCII",
          label: "Review non-ASCII character",
          message: "Non-ASCII character in machine-sensitive text",
          detail: "Connection-string syntax is generally ASCII; Unicode data should be intentionally percent-encoded where supported.",
          replacement: character.normalize("NFKC"),
          severity: "warning",
          reason: "Review this character and use an explicitly encoded form if the provider supports it.",
        };
      }
      if (!issue) continue;
      const replacement = issue.replacement;
      findings.push(withBaseFinding(issue.code, issue.severity, issue.message, issue.detail, {
        range: [index, index + 1],
        fix: replaceOne(input, index, replacement, issue.label, issue.reason),
      }));
    }
    return findings;
  },
};
