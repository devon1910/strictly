import type { Finding, EnvAssignment, Rule } from "../types";
import { makeFix, withBaseFinding } from "../utils";

const EXPECTED_NAMES = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "REDIS_URL",
  "MYSQL_URL",
  "MONGODB_URI",
  "DATABASE_HOST",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "SUPABASE_URL",
  "NEON_DATABASE_URL",
]);

function lineText(input: string, assignment: EnvAssignment): string {
  return input.slice(assignment.lineStart, assignment.lineEnd);
}

function missingUnderscore(value: string): boolean {
  return EXPECTED_NAMES.has(value) || /^(?:DATABASE|DIRECT|REDIS|MYSQL|MONGODB|SUPABASE|NEON)(?:URL|URI|HOST|NAME|USER|PASSWORD)$/u.test(value);
}

export const envStructureRule: Rule = {
  code: "env-structure",
  appliesTo: (_input, ctx) => ctx.format === "env" && Boolean(ctx.env),
  check(input, ctx): Finding[] {
    const env = ctx.env;
    if (!env) return [];
    const findings: Finding[] = [];
    for (const assignment of env.assignments) {
      const line = lineText(input, assignment);
      const equals = line.indexOf("=");
      const rawKeyStart = assignment.assignmentStart;
      const rawKeyEnd = equals >= 0 ? assignment.lineStart + equals : assignment.lineEnd;
      if (assignment.malformed) {
        findings.push(withBaseFinding(
          "ENV_MALFORMED_ASSIGNMENT",
          "error",
          "Environment variable is missing '='",
          "Each dotenv assignment needs a name followed by '=' and a value; a bare name is not portable across shells and dotenv loaders.",
          { range: [assignment.nameStart, assignment.nameEnd], symptom: "The application may start without the variable and later report a misleading connection error." },
        ));
      }
      if (/\s/u.test(input.slice(rawKeyStart, rawKeyEnd))) {
        findings.push(withBaseFinding(
          "ENV_WHITESPACE_IN_NAME",
          "error",
          "Whitespace in environment variable name",
          "Environment variable names cannot contain spaces or tabs; a loader may truncate the name or treat this as a different assignment.",
          { range: [rawKeyStart, rawKeyEnd], symptom: "The application may read an unset variable and report a misleading connection failure." },
        ));
      }
      if (assignment.name.length === 0) {
        findings.push(withBaseFinding(
          "ENV_MALFORMED_ASSIGNMENT",
          "error",
          "Environment variable name is empty",
          "An assignment must start with a portable shell variable name.",
          { range: [rawKeyStart, Math.max(rawKeyEnd, rawKeyStart + 1)], symptom: "The application may ignore this value and report a missing configuration error." },
        ));
      } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(assignment.name)) {
        findings.push(withBaseFinding(
          "ENV_INVALID_NAME",
          "error",
          `Invalid environment variable name '${assignment.name}'`,
          "Use letters, digits and underscores, starting with a letter or underscore.",
          { range: [assignment.nameStart, assignment.nameEnd], symptom: "The application may ignore the variable or read a differently named value." },
        ));
      } else if (missingUnderscore(assignment.name)) {
        // This is intentionally narrow: arbitrary names are valid, while the
        // common DATABASEURL/DATABASEURI typo is actionable without guessing.
        const canonical = assignment.name.replace(/(DATABASE|DIRECT|REDIS|MYSQL|MONGODB|SUPABASE|NEON)(URL|URI|HOST|NAME|USER|PASSWORD)$/u, "$1_$2");
        if (canonical !== assignment.name && EXPECTED_NAMES.has(canonical)) {
          findings.push(withBaseFinding(
            "ENV_DROPPED_UNDERSCORE",
            "warning",
            `Environment variable '${assignment.name}' may be missing an underscore`,
            `The conventional name is '${canonical}'. A dropped underscore can leave the intended variable unset while a similarly named one is populated.`,
            { range: [assignment.nameStart, assignment.nameEnd] },
          ));
        }
      }
      if (assignment.quote && !assignment.closedQuote) {
        const quoteIndex = Math.max(assignment.valueStart - 1, assignment.assignmentStart);
        findings.push(withBaseFinding(
          "ENV_UNBALANCED_QUOTES",
          "error",
          "Unbalanced quotes in environment value",
          "The opening quote has no matching closing quote; loaders disagree on whether following lines belong to this value.",
          {
            range: [quoteIndex, quoteIndex + 1],
            symptom: "The application may receive a truncated value or fail to parse the environment file.",
            fix: makeFix(input, input.length, input.length, assignment.quote, "Close environment quote", "Add a matching closing quote as a separate proposal; no value is changed automatically."),
          },
        ));
      }
      if (assignment.multiline) {
        findings.push(withBaseFinding(
          "ENV_MULTILINE_VALUE",
          "warning",
          "Environment value spans multiple lines",
          "Wrapped values are interpreted differently by dotenv loaders and can insert a newline into a credential or URI.",
          { range: [assignment.valueStart, assignment.valueEnd] },
        ));
      }
      if (assignment.quote && /[ \t]/u.test(assignment.value)) {
        findings.push(withBaseFinding(
          "ENV_QUOTED_SPACE",
          "info",
          "Space inside quoted environment value",
          "The space may be intentional. It is shown for review but is never stripped automatically.",
          { range: [assignment.valueStart, assignment.valueEnd] },
        ));
      }
    }
    if (env.hasExport && env.hasBare) {
      findings.push(withBaseFinding(
        "ENV_MIXED_EXPORT_STYLE",
        "info",
        "Environment block mixes export and bare assignments",
        "Choose one style for the target loader: export is shell syntax, while bare NAME=value is dotenv syntax.",
      ));
    }
    return findings;
  },
};

export const envRules: readonly Rule[] = [envStructureRule];
