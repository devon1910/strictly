import { parseContext, parseUri } from "./parser";
import { formatRules, rules as builtInRules, universalRules } from "./registry";
import { ensureSymptom } from "./symptoms";
import { offsetFinding } from "./utils";
import type { Finding, LintOptions, LintResult, ParseContext, Rule } from "./types";

function runRules(input: string, ctx: ParseContext, registry: readonly Rule[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of registry) {
    if (!rule.appliesTo(input, ctx)) continue;
    for (const finding of rule.check(input, ctx)) {
      findings.push({ ...finding, symptom: ensureSymptom(finding.code, finding.severity, finding.symptom) });
    }
  }
  return findings;
}

function nestedRules(registry: readonly Rule[]): readonly Rule[] {
  // Invisible and environment rules already ran against the complete block.
  // Re-run structural/provider/secret rules only against the extracted value.
  return registry.filter((rule) => !["invisible-characters", "env-structure", "ado-net-structure", "json-punctuation"].includes(rule.code));
}

/**
 * Lint a connection string, environment block, or key/value connection string.
 * This function is pure: it reads no environment, performs no I/O, and never
 * changes the supplied string. Every repair is returned as a separate proposal.
 */
export function lint(input: string, options: LintOptions = {}): LintResult {
  if (typeof input !== "string") {
    const finding: Finding = {
      code: "INPUT_NOT_STRING",
      severity: "error",
      message: "Input must be a string",
      detail: "Pass the exact text to lint; no coercion is performed because coercion can hide copy errors.",
      symptom: ensureSymptom("INPUT_NOT_STRING", "error"),
    };
    return { input, format: "unrecognized", confidence: 0, findings: [finding] };
  }
  const registry = options.rules ?? builtInRules;
  const context = parseContext(input);
  const universal = options.rules ? registry.filter((rule) => rule.code === "invisible-characters") : universalRules;
  const specific = options.rules ? registry.filter((rule) => rule.code !== "invisible-characters") : formatRules;
  let findings = runRules(input, context, universal);
  if (context.format !== "unrecognized") findings.push(...runRules(input, context, specific));

  // An env assignment is still one input value. Map nested URI observations back
  // into that original block and expand proposed fixes to the complete block.
  if (context.env) {
    const uriRegistry = nestedRules(registry);
    for (const assignment of context.env.assignments) {
      if (!assignment.value || assignment.malformed) continue;
      const nestedContext = parseContext(assignment.value);
      if (!nestedContext.uri || nestedContext.format !== "uri") continue;
      const nested = runRules(assignment.value, nestedContext, uriRegistry);
      for (const finding of nested) findings.push(offsetFinding(finding, assignment.valueStart, input, assignment.value));
    }
  }

  if (options.includeInfo === false) findings = findings.filter((finding) => finding.severity !== "info");
  return { input, format: context.format, confidence: context.confidence, findings };
}

/** A compact boot-time formatter for the API example in the README. */
export function format(findings: readonly Finding[]): string {
  return findings
    .map((finding) => {
      const location = finding.range ? ` [${finding.range[0]}–${finding.range[1]}]` : "";
      return `${finding.severity.toUpperCase()} ${finding.code}${location}: ${finding.message} — ${finding.detail}`;
    })
    .join("\n");
}

export { parseContext, parseUri };
