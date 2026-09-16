/** The urgency assigned to a finding. */
export type Severity = "error" | "warning" | "info";

/** A separate, never automatically applied, suggestion for repairing input. */
export interface ProposedFix {
  label: string;
  /** The complete proposed value, not just the changed fragment. */
  result: string;
  reason: string;
}

/** One deterministic observation made by the linter. */
export interface Finding {
  /** Stable machine-readable identifier. */
  code: string;
  severity: Severity;
  /** A one-line explanation suitable for a finding list. */
  message: string;
  /** More context about why the observation matters. */
  detail: string;
  /** UTF-16 character offsets into the value passed to lint. */
  range?: [number, number];
  /** The static runtime symptom this can cause, where applicable. */
  symptom?: string;
  /** A proposed value. It is never applied by lint. */
  fix?: ProposedFix;
}

export interface LintOptions {
  /** Replace the built-in registry. Useful for embedding and testing custom rules. */
  rules?: readonly Rule[];
  /** Include informational observations. Defaults to true. */
  includeInfo?: boolean;
}

/** A complete lint result. The original input is returned unchanged. */
export interface LintResult {
  input: string;
  format: InputFormat;
  /** Classifier confidence from 0 (no known format) to 1 (exact structural match). */
  confidence: number;
  findings: Finding[];
}

export type UriScheme =
  | "postgresql"
  | "postgres"
  | "mysql"
  | "mongodb"
  | "mongodb+srv"
  | "redis"
  | "rediss"
  | (string & {});

export interface QueryParameter {
  name: string;
  value: string;
  nameStart: number;
  valueStart: number;
  segmentStart: number;
  segmentEnd: number;
  hasEquals: boolean;
}

/** The result of the single URI parse shared by URI and provider rules. */
export interface UriParts {
  scheme: UriScheme;
  schemeStart: number;
  authorityStart: number;
  authorityEnd: number;
  /** End of the complete URI (input length, or before a fragment where useful). */
  end: number;
  userinfoStart?: number;
  userinfoEnd?: number;
  username?: string;
  usernameStart?: number;
  password?: string;
  passwordStart?: number;
  host?: string;
  hostStart?: number;
  hostEnd?: number;
  port?: string;
  portStart?: number;
  path?: string;
  pathStart?: number;
  query?: string;
  queryStart?: number;
  fragment?: string;
  fragmentStart?: number;
  queryParameters: QueryParameter[];
  /** True when the URI starts with a known scheme but does not use ://. */
  malformedSeparator?: boolean;
  /** The raw authority as it appeared in the input. */
  rawAuthority: string;
}

export type InputFormat = "uri" | "ado-net" | "env" | "secret" | "json" | "unrecognized";

export interface EnvAssignment {
  name: string;
  nameStart: number;
  nameEnd: number;
  value: string;
  valueStart: number;
  valueEnd: number;
  lineStart: number;
  lineEnd: number;
  assignmentStart: number;
  exportPrefix?: [number, number];
  quote?: "'" | '"';
  closedQuote: boolean;
  multiline: boolean;
  /** A line that looked like an environment assignment but had no '='. */
  malformed?: boolean;
}

export interface EnvContext {
  assignments: EnvAssignment[];
  hasExport: boolean;
  hasBare: boolean;
}

export interface AdonetPair {
  key: string;
  keyStart: number;
  keyEnd: number;
  value: string;
  valueStart: number;
  valueEnd: number;
  segmentStart: number;
  segmentEnd: number;
  quote?: "'" | '"';
}

export interface AdonetContext {
  pairs: AdonetPair[];
}

/** Shared parsing work made available to every rule. */
export interface ParseContext {
  format: InputFormat;
  confidence: number;
  uri?: UriParts;
  env?: EnvContext;
  adonet?: AdonetContext;
}

export interface Rule {
  code: string;
  appliesTo(input: string, ctx: ParseContext): boolean;
  check(input: string, ctx: ParseContext): Finding[];
}
