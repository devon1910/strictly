import type { Finding, ParseContext, Rule, UriParts } from "../types";
import { isKnownScheme } from "../parser";
import { makeFix, replaceOne, withBaseFinding } from "../utils";

const ENCODED_SPECIALS: Record<string, string> = {
  "@": "%40",
  "/": "%2F",
  ":": "%3A",
  "#": "%23",
  "?": "%3F",
  "%": "%25",
};

const QUERY_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  postgresql: new Set(["sslmode", "channel_binding", "connect_timeout", "options", "application_name", "target_session_attrs", "sslcert", "sslkey", "sslrootcert", "gssencmode", "krbsrvname", "load_balance_hosts"]),
  postgres: new Set(["sslmode", "channel_binding", "connect_timeout", "options", "application_name", "target_session_attrs", "sslcert", "sslkey", "sslrootcert", "gssencmode", "krbsrvname", "load_balance_hosts"]),
  mysql: new Set(["ssl", "ssl-mode", "charset", "connecttimeout", "connectiontimeout", "socket", "allowPublicKeyRetrieval", "serverTimezone", "useUnicode", "useSSL"]),
  mongodb: new Set(["authSource", "replicaSet", "retryWrites", "retryReads", "w", "tls", "ssl", "maxPoolSize", "minPoolSize", "directConnection", "appName", "compressors", "connectTimeoutMS", "serverSelectionTimeoutMS"]),
  "mongodb+srv": new Set(["authSource", "replicaSet", "retryWrites", "retryReads", "w", "tls", "ssl", "maxPoolSize", "minPoolSize", "directConnection", "appName", "compressors", "connectTimeoutMS", "serverSelectionTimeoutMS"]),
  redis: new Set(["db", "family", "keepAlive", "noReadyCheck", "connectTimeout", "retryStrategy", "maxRetriesPerRequest"]),
  rediss: new Set(["db", "family", "keepAlive", "noReadyCheck", "connectTimeout", "retryStrategy", "maxRetriesPerRequest"]),
};

const DATABASE_SCHEME_WITH_SEPARATOR = /^(?:postgresql|postgres|mysql|mongodb(?:\+srv)?|redis|rediss)\s*:\s*\/\s*\//iu;

/**
 * Runs before format classification because whitespace in `: //` prevents the
 * normal URI parser from recognizing the value in the first place.
 */
export const uriSchemeWhitespaceRule: Rule = {
  code: "uri-scheme-whitespace",
  appliesTo: (input) => {
    const prefix = input.match(DATABASE_SCHEME_WITH_SEPARATOR)?.[0];
    return Boolean(prefix && /[ \t\r\n]/u.test(prefix));
  },
  check(input) {
    const schemePrefix = input.match(DATABASE_SCHEME_WITH_SEPARATOR)?.[0];
    if (!schemePrefix) return [];
    const compact = input.replace(/[ \t\r\n]+/gu, "");
    return [withBaseFinding(
      "URI_SCHEME_WHITESPACE",
      "error",
      "Database URI contains whitespace",
      "Whitespace around the scheme separator or structural delimiters prevents drivers from reading the intended connection string.",
      {
        range: [0, schemePrefix.length],
        symptom: "The database driver may reject the connection string before attempting a connection.",
        fix: {
          label: "Remove whitespace from database URI",
          result: compact,
          reason: "Database connection URIs do not use unencoded whitespace. Review the complete whitespace-free proposal before copying it.",
        },
      },
    )];
  },
};

function uri(ctx: ParseContext): UriParts | undefined {
  return ctx.uri;
}

function inRange(index: number, start: number | undefined, value: string | undefined): boolean {
  return start !== undefined && value !== undefined && index >= start && index < start + value.length;
}

function componentAt(parts: UriParts, index: number): "username" | "password" | "host" | "path" | "query" | "fragment" | "scheme" {
  if (inRange(index, parts.passwordStart, parts.password)) return "password";
  if (inRange(index, parts.usernameStart, parts.username)) return "username";
  if (inRange(index, parts.hostStart, parts.host)) return "host";
  if (inRange(index, parts.pathStart, parts.path)) return "path";
  if (parts.queryStart !== undefined && index > parts.queryStart && index < (parts.fragmentStart ?? Number.POSITIVE_INFINITY)) return "query";
  if (parts.fragmentStart !== undefined && index > parts.fragmentStart) return "fragment";
  return "scheme";
}

function symptomForComponent(component: ReturnType<typeof componentAt>): string {
  if (component === "password" || component === "username") return "The driver may report password authentication failed even though the credential itself is correct.";
  if (component === "host") return "The driver may report a DNS or network error for a host that was never intended.";
  if (component === "path") return "The driver may report that the database does not exist.";
  return "The driver may reject the connection string before attempting a connection.";
}

function specialFinding(input: string, parts: UriParts, index: number, character: string, component: "username" | "password"): Finding {
  const encoded = ENCODED_SPECIALS[character];
  const label = `Encode ${character} in ${component}`;
  return withBaseFinding(
    component === "password" ? "URI_UNENCODED_PASSWORD_CHAR" : "URI_UNENCODED_USERNAME_CHAR",
    "error",
    `Unencoded '${character}' in ${component}`,
    `URI parsers use '${character}' as syntax. Encode it as ${encoded} so it remains part of the ${component}.`,
    {
      range: [index, index + 1],
      symptom: symptomForComponent(component),
      fix: replaceOne(input, index, encoded, label, `Percent-encode '${character}' in the ${component}; no change is applied automatically.`),
    },
  );
}

/** Highest-value URI rule: userinfo syntax must not be mistaken for credentials. */
export const uriUnencodedSpecialCharacterRule: Rule = {
  code: "uri-unencoded-special-character",
  appliesTo: (_input, ctx) => Boolean(uri(ctx)),
  check(input, ctx) {
    const parts = uri(ctx);
    if (!parts || parts.malformedSeparator) return [];
    const findings: Finding[] = [];
    const scan = (value: string | undefined, start: number | undefined, component: "username" | "password") => {
      if (value === undefined || start === undefined) return;
      for (let offset = 0; offset < value.length; offset += 1) {
        const character = value[offset];
        if (!ENCODED_SPECIALS[character]) continue;
        if (character === "%" && /^[0-9a-f]{2}$/iu.test(value.slice(offset + 1, offset + 3))) continue;
        findings.push(specialFinding(input, parts, start + offset, character, component));
      }
    };
    scan(parts.username, parts.usernameStart, "username");
    scan(parts.password, parts.passwordStart, "password");

    // Multiple @ characters are the classic failure mode. The first @ after
    // username/password is the character that must be encoded; the final @ is
    // the actual userinfo delimiter. Reporting the first one also gives callers
    // the character-level fix that turns p@ssw0rd@host into p%40ssw0rd@host.
    if (parts.passwordStart !== undefined && parts.userinfoEnd !== undefined && parts.host?.includes("@")) {
      const index = parts.userinfoEnd;
      const parsedHost = parts.host.slice(0, parts.host.indexOf("@"));
      findings.push(withBaseFinding(
        "URI_UNENCODED_PASSWORD_CHAR",
        "error",
        "Unencoded '@' in password",
        `The parser ends userinfo at the first '@', so the password fragment shifts into host '${parsedHost}'. Encode this '@' as %40 to keep it in the password.`,
        {
          range: [index, index + 1],
          symptom: "The driver may report a DNS or network error for the password fragment instead of an authentication error.",
          fix: replaceOne(input, index, "%40", "Encode @ in password", "Percent-encode the password delimiter; the proposed value is separate and is never applied automatically."),
        },
      ));
    }
    return findings;
  },
};

export const uriWhitespaceRule: Rule = {
  code: "uri-internal-whitespace",
  appliesTo: (_input, ctx) => Boolean(uri(ctx) && !ctx.uri?.malformedSeparator),
  check(input, ctx) {
    const parts = uri(ctx);
    if (!parts) return [];
    const findings: Finding[] = [];
    for (let index = 0; index < input.length; index += 1) {
      if (!/[ \t\r\n]/u.test(input[index])) continue;
      const component = componentAt(parts, index);
      // Newlines at the end of an OCR block are still valuable to the invisible
      // character rule, but do not produce a second URI finding when outside it.
      if (index === input.length - 1 && input[index] === "\n") continue;
      findings.push(withBaseFinding(
        "URI_INTERNAL_WHITESPACE",
        "error",
        `Unexpected whitespace in ${component}`,
        `Whitespace at offset ${index} becomes part of the ${component}; it is not ignored by URI parsers.`,
        {
          range: [index, index + 1],
          symptom: symptomForComponent(component),
          fix: replaceOne(input, index, "", `Remove whitespace from ${component}`, `Remove the unexpected whitespace from ${component}; inspect the proposed complete value before copying it.`),
        },
      ));
    }
    return findings;
  },
};

export const uriSchemeRule: Rule = {
  code: "uri-scheme",
  appliesTo: (_input, ctx) => Boolean(uri(ctx)),
  check(input, ctx) {
    const parts = uri(ctx);
    if (!parts) return [];
    const findings: Finding[] = [];
    if (parts.malformedSeparator) {
      const start = parts.authorityStart;
      findings.push(withBaseFinding(
        "URI_MISSING_SEPARATOR",
        "error",
        "URI scheme must be followed by ://",
        `The ${parts.scheme} scheme needs an authority separator so the driver can locate userinfo and host.`,
        {
          range: [start, input[start] === "/" ? Math.min(start + 1, input.length) : start],
          symptom: "The driver may reject the connection string as malformed before attempting a connection.",
          fix: input[start] === "/"
            ? makeFix(input, start, start + 1, "//", "Insert // after scheme", "Add the required URI authority separator; review all components before use.")
            : makeFix(input, start, start, "//", "Insert // after scheme", "Add the required URI authority separator; review all components before use."),
        },
      ));
      return findings;
    }
    if (!isKnownScheme(parts.scheme)) {
      findings.push(withBaseFinding(
        "URI_UNKNOWN_SCHEME",
        "warning",
        `Unsupported URI scheme '${parts.scheme}'`,
        "The built-in structural rules know the common database schemes; a custom scheme may need an embedding rule.",
        { range: [parts.schemeStart, parts.authorityStart - 3] },
      ));
    }
    return findings;
  },
};

/** Catch URI-looking input that cannot be parsed into a normal URI context. */
export const uriCandidateRule: Rule = {
  code: "uri-candidate",
  appliesTo: (input, ctx) => !ctx.uri && (/^\/\//u.test(input) || /^[^\s/:="']+:\/\//u.test(input)),
  check(input): Finding[] {
    if (/^\/\//u.test(input)) {
      return [withBaseFinding(
        "URI_MISSING_SCHEME",
        "error",
        "URI scheme is missing",
        "A database URI needs a scheme such as postgresql://, mysql://, mongodb://, redis://, or rediss:// so the correct parser is selected.",
        { range: [0, 2], symptom: "The driver may reject the connection string or choose the wrong protocol." },
      )];
    }
    const separator = input.indexOf("://");
    return [withBaseFinding(
      "URI_MALFORMED_SCHEME",
      "error",
      "URI scheme is malformed",
      "A URI scheme must start with a letter and contain only letters, digits, '+', '-' or '.'.",
      { range: [0, Math.max(separator, 1)], symptom: "The driver may reject the connection string before attempting a connection." },
    )];
  },
};

export const uriAuthorityRule: Rule = {
  code: "uri-authority",
  appliesTo: (_input, ctx) => Boolean(uri(ctx) && !ctx.uri?.malformedSeparator),
  check(input, ctx) {
    const parts = uri(ctx);
    if (!parts) return [];
    const findings: Finding[] = [];
    if (!parts.host || parts.host.length === 0) {
      findings.push(withBaseFinding(
        "URI_MISSING_HOST",
        "error",
        "URI host is missing",
        "A database URI needs a host between the authority separator and its path or query.",
        { range: [parts.authorityStart, parts.authorityEnd], symptom: "The driver may report a DNS or network error without a host to resolve." },
      ));
    }
    const authority = input.slice(parts.authorityStart, parts.authorityEnd);
    const openBracket = authority.indexOf("[");
    const closeBracket = authority.indexOf("]");
    if (openBracket >= 0 && (closeBracket < openBracket || closeBracket < 0)) {
      findings.push(withBaseFinding(
        "URI_UNBALANCED_BRACKETS",
        "error",
        "Unbalanced brackets in URI host",
        "IPv6 hosts must use a complete [address] pair; an incomplete pair changes where the port is parsed.",
        { range: [parts.authorityStart + openBracket, parts.authorityStart + openBracket + 1], symptom: "The driver may reject the host or report a misleading network error." },
      ));
    } else if (closeBracket >= 0 && openBracket < 0) {
      findings.push(withBaseFinding(
        "URI_UNBALANCED_BRACKETS",
        "error",
        "Unbalanced closing bracket in URI host",
        "A closing bracket without an opening bracket cannot delimit an IPv6 host.",
        { range: [parts.authorityStart + closeBracket, parts.authorityStart + closeBracket + 1], symptom: "The driver may reject the host as malformed." },
      ));
    }
    if (parts.portStart !== undefined && parts.port !== undefined) {
      if (!/^\d+$/u.test(parts.port) || Number(parts.port) > 65535) {
        findings.push(withBaseFinding(
          "URI_INVALID_PORT",
          "error",
          "Invalid URI port",
          "Ports must be decimal digits in the 0–65535 range; malformed ports can be mistaken for host text.",
          { range: [parts.portStart, parts.portStart + parts.port.length], symptom: "The driver may reject the URI or attempt to resolve a host with the wrong port." },
        ));
      }
    }
    if (parts.host?.includes("[")) {
      const expectedClose = parts.host.indexOf("]");
      if (expectedClose < 0) return findings;
    } else if ((parts.host?.match(/:/gu)?.length ?? 0) > 1) {
      const start = parts.hostStart ?? parts.authorityStart;
      findings.push(withBaseFinding(
        "URI_UNBRACKETED_IPV6",
        "error",
        "IPv6 host must be enclosed in brackets",
        "An IPv6 literal with multiple colons must use [address] so the final colon can be parsed as a port separator.",
        { range: [start, (parts.hostEnd ?? start) + 1], symptom: "The driver may reject the host or connect using the wrong port." },
      ));
    }
    return findings;
  },
};

function percentEscapeFinding(input: string, parts: UriParts, start: number, end: number): Finding {
  return withBaseFinding(
    "URI_MALFORMED_PERCENT_ESCAPE",
    "error",
    "Malformed percent escape",
    "A percent sign in a URI must be followed by two hexadecimal digits; malformed escapes can change the decoded credential.",
    {
      range: [start, end],
      symptom: "The driver may reject the URI or authenticate with a different decoded value.",
      fix: replaceOne(input, start, "%25", "Encode percent sign", "Encode the literal percent sign before the driver decodes URI components."),
    },
  );
}

export const uriQueryRule: Rule = {
  code: "uri-query",
  appliesTo: (_input, ctx) => Boolean(uri(ctx) && !ctx.uri?.malformedSeparator),
  check(input, ctx) {
    const parts = uri(ctx);
    if (!parts) return [];
    const findings: Finding[] = [];
    const seen = new Map<string, number>();
    if (parts.userinfoStart !== undefined && parts.userinfoEnd !== undefined) {
      for (let index = parts.userinfoStart; index < parts.userinfoEnd; index += 1) {
        if (input[index] !== "%") continue;
        if (!/^[0-9a-f]{2}$/iu.test(input.slice(index + 1, index + 3))) findings.push(percentEscapeFinding(input, parts, index, index + 1));
      }
    }
    const escapedRanges: Array<[number, number]> = [];
    for (const start of [parts.pathStart, parts.queryStart, parts.fragmentStart]) {
      if (start === undefined) continue;
      const end = start === parts.queryStart ? (parts.fragmentStart ?? input.length) : input.length;
      for (let index = start; index < end; index += 1) {
        if (input[index] !== "%") continue;
        if (!/^[0-9a-f]{2}$/iu.test(input.slice(index + 1, index + 3))) {
          const range: [number, number] = [index, index + 1];
          if (!escapedRanges.some(([left, right]) => left === range[0] && right === range[1])) escapedRanges.push(range);
        }
      }
    }
    for (const [start, end] of escapedRanges) findings.push(percentEscapeFinding(input, parts, start, end));
    for (const parameter of parts.queryParameters) {
      if (!parameter.name && !parameter.value && parameter.segmentStart === parameter.segmentEnd) {
        findings.push(withBaseFinding(
          "URI_MALFORMED_QUERY",
          "error",
          "Empty query parameter",
          "A query string cannot contain an empty segment; an accidental trailing '&' is often introduced during copying.",
          { range: [parameter.segmentStart, Math.min(parameter.segmentEnd + 1, input.length)], symptom: "The driver may reject the connection string or ignore later options." },
        ));
        continue;
      }
      if (!parameter.hasEquals || parameter.name.length === 0) {
        findings.push(withBaseFinding(
          "URI_MALFORMED_QUERY",
          "error",
          "Malformed query parameter",
          "Query parameters must use a non-empty name=value pair so the driver can apply them deterministically.",
          { range: [parameter.segmentStart, parameter.segmentEnd], symptom: "The driver may reject or silently ignore connection options." },
        ));
      }
      const normalized = parameter.name.toLowerCase();
      if (seen.has(normalized)) {
        findings.push(withBaseFinding(
          "URI_DUPLICATE_QUERY_PARAMETER",
          "warning",
          `Duplicate query parameter '${parameter.name}'`,
          "Drivers differ on whether the first or last duplicate wins; keep one explicit value.",
          { range: [parameter.nameStart, parameter.nameStart + parameter.name.length] },
        ));
      } else {
        seen.set(normalized, parameter.nameStart);
      }
      const allowlist = QUERY_ALLOWLIST[parts.scheme];
      if (allowlist && !Array.from(allowlist).some((allowed) => allowed.toLowerCase() === normalized)) {
        // Only emit a misspelling warning when the name is close to a known option.
        // Unknown provider extensions are left alone to avoid false positives.
        const close = Array.from(allowlist).find((allowed) => editDistanceAtMostOne(allowed.toLowerCase(), normalized));
        if (close) {
          findings.push(withBaseFinding(
            "URI_MISSPELLED_QUERY_PARAMETER",
            "warning",
            `Query parameter '${parameter.name}' may be misspelled`,
            `Did you mean '${close}'? A near-miss is accepted as a different option by most drivers.`,
            { range: [parameter.nameStart, parameter.nameStart + parameter.name.length] },
          ));
        }
        if (!close) {
          findings.push(withBaseFinding(
            "URI_UNKNOWN_QUERY_PARAMETER",
            "warning",
            `Unknown query parameter '${parameter.name}'`,
            `The '${parts.scheme}' allowlist does not include this spelling. Confirm it is a documented provider extension rather than a typo.`,
            { range: [parameter.nameStart, parameter.nameStart + parameter.name.length] },
          ));
        }
      }
    }
    return findings;
  },
};

/** PostgreSQL's TLS mode is a correctness signal, not proof of connectivity. */
export const postgresSecurityRule: Rule = {
  code: "postgres-security",
  appliesTo: (_input, ctx) => Boolean(ctx.uri && (ctx.uri.scheme === "postgres" || ctx.uri.scheme === "postgresql")),
  check(_input, ctx): Finding[] {
    const parts = ctx.uri;
    if (!parts) return [];
    if (parts.queryParameters.some((parameter) => parameter.name.toLowerCase() === "sslmode")) return [];
    return [withBaseFinding(
      "POSTGRES_MISSING_SSLMODE",
      "warning",
      "PostgreSQL URI omits sslmode",
      "A URI can parse and connect while still using an unintended TLS policy. Set sslmode explicitly for production, according to the provider's requirements.",
      { range: [parts.authorityStart, parts.authorityEnd] },
    )];
  },
};

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let differences = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return differences + (i < a.length || j < b.length ? 1 : 0) <= 1;
}

export const uriRules: readonly Rule[] = [
  uriCandidateRule,
  uriUnencodedSpecialCharacterRule,
  uriWhitespaceRule,
  uriSchemeRule,
  uriAuthorityRule,
  uriQueryRule,
  postgresSecurityRule,
];
