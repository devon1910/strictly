/** Static symptoms keep the library deterministic and useful at boot time. */
const SYMPTOMS: Record<string, string> = {
  INVISIBLE_ZERO_WIDTH_SPACE: "The driver may report authentication failed even though the visible credential is correct.",
  INVISIBLE_ZERO_WIDTH_NON_JOINER: "The driver may report authentication failed even though the visible credential is correct.",
  INVISIBLE_ZERO_WIDTH_JOINER: "The driver may report authentication failed even though the visible credential is correct.",
  INVISIBLE_BOM: "The driver may report authentication failed or a DNS failure for a value that looks correct.",
  INVISIBLE_SOFT_HYPHEN: "The driver may report a DNS or authentication failure for a value that looks correct.",
  INVISIBLE_NON_BREAKING_SPACE: "The driver may report authentication failed or a database-not-found error.",
  INVISIBLE_UNICODE_SPACE: "The driver may report authentication failed or a database-not-found error.",
  INVISIBLE_CARRIAGE_RETURN: "The driver may report authentication failed or a malformed connection string.",
  INVISIBLE_TAB: "The driver may report authentication failed or a malformed connection string.",
  INVISIBLE_NON_PRINTABLE: "The driver may reject the value or report a misleading connection error.",
  URI_UNENCODED_PASSWORD_CHAR: "The driver may report authentication failed or DNS failure because URI delimiters changed the parsed password and host.",
  URI_UNENCODED_USERNAME_CHAR: "The driver may report authentication failed because URI delimiters changed the parsed username.",
  URI_INTERNAL_WHITESPACE: "The driver may report authentication failed, DNS failure, or database-not-found depending on the affected component.",
  URI_MISSING_SEPARATOR: "The driver may reject the connection string as malformed before attempting a connection.",
  URI_MISSING_HOST: "The driver may report a DNS or network error without a host to resolve.",
  URI_UNBALANCED_BRACKETS: "The driver may reject the host or report a misleading network error.",
  URI_INVALID_PORT: "The driver may reject the URI or attempt to connect to the wrong port.",
  URI_MALFORMED_QUERY: "The driver may reject the connection string or silently ignore later options.",
  URI_MALFORMED_PERCENT_ESCAPE: "The driver may reject the URI or authenticate with a different decoded value.",
  ENV_MALFORMED_ASSIGNMENT: "The application may start without the variable and later report a misleading connection error.",
  ENV_WHITESPACE_IN_NAME: "The application may read an unset variable and report a misleading connection failure.",
  ENV_MALFORMED_NAME: "The application may ignore this variable or read a differently named value.",
  ENV_INVALID_NAME: "The application may ignore this variable or read a differently named value.",
  ENV_UNBALANCED_QUOTES: "The application may receive a truncated value or fail to parse the environment file.",
  ENV_MULTILINE_VALUE: "The loader may insert a newline into the credential and report authentication failed.",
  ADONET_EMPTY_KEY: "The driver may ignore the option and use an unintended default.",
  ADONET_MALFORMED_PAIR: "The driver may reject the connection string or silently ignore later options.",
  ADONET_UNBALANCED_QUOTES: "The driver may reject the connection string or read a truncated password.",
  JSON_MALFORMED_PUNCTUATION: "The configuration loader may fail before the application attempts a connection.",
};

export function symptomFor(code: string): string {
  return SYMPTOMS[code] ?? "The application may reject this value or report a misleading runtime error.";
}

export function ensureSymptom(code: string, severity: string, symptom?: string): string | undefined {
  return severity === "error" ? symptom ?? symptomFor(code) : symptom;
}

