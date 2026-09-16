import type {
  AdonetContext,
  AdonetPair,
  EnvAssignment,
  EnvContext,
  InputFormat,
  ParseContext,
  QueryParameter,
  UriParts,
  UriScheme,
} from "./types";

const URI_SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/u;
const RECOGNIZED_URI = /^(postgresql|postgres|mysql|mongodb|mongodb\+srv|redis|rediss):\/\//iu;
const KNOWN_SCHEMES = new Set(["postgresql", "postgres", "mysql", "mongodb", "mongodb+srv", "redis", "rediss"]);
const ADONET_KEYS = new Set([
  "server",
  "data source",
  "address",
  "network address",
  "initial catalog",
  "database",
  "host",
  "hostname",
  "username",
  "user name",
  "user id",
  "uid",
  "user",
  "password",
  "pwd",
  "port",
  "ssl mode",
  "encrypt",
  "trusted_connection",
  "integrated security",
]);

function nextBoundary(input: string, start: number, includeSlash = true): number {
  let result = input.length;
  for (const marker of includeSlash ? ["/", "?", "#"] : ["?", "#"]) {
    const index = input.indexOf(marker, start);
    if (index >= 0 && index < result) result = index;
  }
  return result;
}

function parseQuery(input: string, queryStart: number, queryEnd: number): QueryParameter[] {
  const result: QueryParameter[] = [];
  const contentStart = queryStart + 1;
  const content = input.slice(contentStart, queryEnd);
  let segmentOffset = 0;
  for (const segment of content.split("&")) {
    const segmentStart = contentStart + segmentOffset;
    const segmentEnd = segmentStart + segment.length;
    const equals = segment.indexOf("=");
    const nameEnd = equals >= 0 ? segmentStart + equals : segmentEnd;
    const valueStart = equals >= 0 ? segmentStart + equals + 1 : segmentEnd;
    result.push({
      name: input.slice(segmentStart, nameEnd),
      value: input.slice(valueStart, segmentEnd),
      nameStart: segmentStart,
      valueStart,
      segmentStart,
      segmentEnd,
      hasEquals: equals >= 0,
    });
    segmentOffset += segment.length + 1;
  }
  return result;
}

/** Parse a URI without invoking URL, whose recovery behaviour hides malformed userinfo. */
export function parseUri(input: string): UriParts | undefined {
  const schemeMatch = input.match(URI_SCHEME);
  if (!schemeMatch) return undefined;
  const scheme = schemeMatch[1].toLowerCase() as UriScheme;
  const schemeStart = 0;
  const schemeEnd = schemeMatch[0].length;
  if (input.slice(schemeEnd, schemeEnd + 2) !== "//") {
    // Keep malformed known schemes in context so a structural rule can explain the separator.
    if (!KNOWN_SCHEMES.has(scheme)) return undefined;
    return {
      scheme,
      schemeStart,
      authorityStart: schemeEnd,
      authorityEnd: schemeEnd,
      end: input.length,
      queryParameters: [],
      malformedSeparator: true,
      rawAuthority: "",
    };
  }

  const authorityStart = schemeEnd + 2;
  const firstBoundary = nextBoundary(input, authorityStart);
  const firstAt = input.indexOf("@", authorityStart);
  let authorityEnd = firstBoundary;
  // A delimiter before @ is often the special character that was accidentally put
  // in userinfo (for example p/a@host). Keep the candidate authority together so
  // the URI rule can point at that character and propose encoding it.
  if (firstAt >= 0 && firstAt > firstBoundary) {
    authorityEnd = nextBoundary(input, firstAt + 1);
  }

  const rawAuthority = input.slice(authorityStart, authorityEnd);
  const uri: UriParts = {
    scheme,
    schemeStart,
    authorityStart,
    authorityEnd,
    end: input.length,
    queryParameters: [],
    rawAuthority,
  };

  const at = rawAuthority.indexOf("@");
  let hostPortStart = authorityStart;
  if (at >= 0) {
    uri.userinfoStart = authorityStart;
    uri.userinfoEnd = authorityStart + at;
    hostPortStart = authorityStart + at + 1;
    const userinfo = input.slice(uri.userinfoStart, uri.userinfoEnd);
    const colon = userinfo.indexOf(":");
    if (colon >= 0) {
      uri.username = userinfo.slice(0, colon);
      uri.usernameStart = uri.userinfoStart;
      uri.password = userinfo.slice(colon + 1);
      uri.passwordStart = uri.userinfoStart + colon + 1;
    } else {
      uri.username = userinfo;
      uri.usernameStart = uri.userinfoStart;
    }
  }

  // If a path/query marker was included in the candidate authority, the actual
  // host ends at that marker. This is also the location used by malformed-userinfo
  // checks above.
  let hostEnd = authorityEnd;
  const hostPort = input.slice(hostPortStart, authorityEnd);
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close >= 0 && close + 1 < hostPort.length && hostPort[close + 1] === ":") {
      hostEnd = hostPortStart + close + 1;
      uri.host = input.slice(hostPortStart, hostPortStart + close + 1);
      uri.hostStart = hostPortStart;
      uri.hostEnd = hostEnd;
      uri.portStart = hostEnd + 1;
      uri.port = input.slice(uri.portStart, authorityEnd);
    } else {
      uri.host = input.slice(hostPortStart, authorityEnd);
      uri.hostStart = hostPortStart;
      uri.hostEnd = authorityEnd;
    }
  } else {
    const colon = hostPort.lastIndexOf(":");
    if (colon >= 0) {
      uri.host = hostPort.slice(0, colon);
      uri.hostStart = hostPortStart;
      uri.hostEnd = hostPortStart + colon;
      uri.portStart = hostPortStart + colon + 1;
      uri.port = input.slice(uri.portStart, authorityEnd);
    } else {
      uri.host = hostPort;
      uri.hostStart = hostPortStart;
      uri.hostEnd = authorityEnd;
    }
  }

  // The first delimiter after the authority is the path; query and fragment are
  // then located relative to it. A slash-before-@ candidate is intentionally
  // treated as userinfo above, so this remains stable for the proposed fix.
  const pathOrQuery = nextBoundary(input, authorityEnd, true);
  const marker = input[authorityEnd];
  if (marker === "/") {
    uri.pathStart = authorityEnd;
    const pathEnd = nextBoundary(input, authorityEnd, false);
    uri.path = input.slice(uri.pathStart, pathEnd);
    if (input[pathEnd] === "?") {
      uri.queryStart = pathEnd;
    }
  } else if (marker === "?") {
    uri.queryStart = authorityEnd;
  }
  // A fragment can occur after either path or query. Find it once from the
  // first non-authority marker, not inside userinfo.
  const contentStart = uri.pathStart ?? uri.queryStart ?? pathOrQuery;
  const fragmentStart = input.indexOf("#", contentStart);
  if (fragmentStart >= 0) {
    uri.fragmentStart = fragmentStart;
    uri.fragment = input.slice(fragmentStart + 1);
  }
  if (uri.queryStart !== undefined) {
    const queryEnd = uri.fragmentStart ?? input.length;
    uri.query = input.slice(uri.queryStart + 1, queryEnd);
    uri.queryParameters = parseQuery(input, uri.queryStart, queryEnd);
  }
  return uri;
}

function findUnquoted(input: string, character: string, start: number, end: number): number {
  let quote: "'" | '"' | undefined;
  for (let i = start; i < end; i += 1) {
    const current = input[i];
    if ((current === "'" || current === '"') && input[i - 1] !== "\\") {
      quote = quote === current ? undefined : quote ?? current;
    } else if (current === character && !quote) {
      return i;
    }
  }
  return -1;
}

/** Parse conventional NAME=value dotenv text, retaining absolute offsets. */
export function parseEnv(input: string): EnvContext {
  const assignments: EnvAssignment[] = [];
  let hasExport = false;
  let hasBare = false;
  let cursor = 0;
  while (cursor < input.length) {
    const newline = input.indexOf("\n", cursor);
    const physicalEnd = newline >= 0 ? newline : input.length;
    const lineEnd = physicalEnd > cursor && input[physicalEnd - 1] === "\r" ? physicalEnd - 1 : physicalEnd;
    const line = input.slice(cursor, lineEnd);
    const leading = line.match(/^\s*/u)?.[0].length ?? 0;
    const contentStart = cursor + leading;
    const content = input.slice(contentStart, lineEnd);
    if (content.length > 0 && !content.startsWith("#")) {
      const exportMatch = content.match(/^export(?:\s+|$)/u);
      const exportLength = exportMatch ? exportMatch[0].length : 0;
      const assignmentStart = contentStart + exportLength;
      if (exportMatch) hasExport = true;
      const equals = findUnquoted(input, "=", assignmentStart, lineEnd);
      const keyRawEnd = equals >= 0 ? equals : lineEnd;
      const keyRaw = input.slice(assignmentStart, keyRawEnd);
      const keyLeading = keyRaw.match(/^\s*/u)?.[0].length ?? 0;
      const keyTrailing = keyRaw.match(/\s*$/u)?.[0].length ?? 0;
      const nameStart = assignmentStart + keyLeading;
      const nameEnd = Math.max(nameStart, keyRawEnd - keyTrailing);
      const name = input.slice(nameStart, nameEnd);
      const looksLikeName = /^[A-Za-z_][A-Za-z0-9_ .-]*$/u.test(name) || name.length === 0;
      // The cursor may need to skip a quoted multiline assignment. Keep this
      // in the line scope because malformed/non-assignment branches still
      // reach the cursor update below.
      let advanceTo = lineEnd;
      if (equals >= 0 && looksLikeName) {
        hasBare = hasBare || !Boolean(exportMatch);
        const rawValueStart = equals + 1;
        let valueStart = rawValueStart;
        while (valueStart < lineEnd && (input[valueStart] === " " || input[valueStart] === "\t")) valueStart += 1;
        const first = input[valueStart];
        let valueEnd = lineEnd;
        let closedQuote = true;
        let multiline = false;
        let quote: "'" | '"' | undefined;
        if (first === "'" || first === '"') {
          quote = first;
          const close = findClosingQuote(input, valueStart + 1, quote);
          if (close < 0) {
            closedQuote = false;
            valueEnd = input.length;
            multiline = input.indexOf("\n", valueStart) >= 0;
          } else {
            valueEnd = close + 1;
            multiline = input.slice(valueStart, close).includes("\n");
          }
          advanceTo = valueEnd;
          valueStart += 1;
          const rawValueEnd = closedQuote ? valueEnd - 1 : valueEnd;
          assignments.push({
            name,
            nameStart,
            nameEnd,
            value: input.slice(valueStart, rawValueEnd),
            valueStart,
            valueEnd: rawValueEnd,
            lineStart: cursor,
            lineEnd: valueEnd,
            assignmentStart,
            exportPrefix: exportMatch ? [contentStart, contentStart + exportLength] : undefined,
            quote,
            closedQuote,
            multiline,
          });
        } else {
          // Dotenv comments begin after a value only when preceded by whitespace.
          // Keep the exact value otherwise; linting must never normalize it.
          const raw = input.slice(valueStart, lineEnd);
          assignments.push({
            name,
            nameStart,
            nameEnd,
            value: raw,
            valueStart,
            valueEnd,
            lineStart: cursor,
            lineEnd,
            assignmentStart,
            exportPrefix: exportMatch ? [contentStart, contentStart + exportLength] : undefined,
            closedQuote,
            multiline,
          });
        }
      } else if (name.length > 0 && (exportMatch || /^[A-Z_][A-Z0-9_. -]*$/u.test(name))) {
        // Keep malformed assignments in the parse context. This lets the rule
        // report an absolute range even though there is no value to recurse into.
        assignments.push({
          name,
          nameStart,
          nameEnd,
          value: "",
          valueStart: lineEnd,
          valueEnd: lineEnd,
          lineStart: cursor,
          lineEnd,
          assignmentStart,
          exportPrefix: exportMatch ? [contentStart, contentStart + exportLength] : undefined,
          closedQuote: true,
          multiline: false,
          malformed: true,
        });
      }
      if (advanceTo > lineEnd) {
        cursor = advanceTo;
        if (cursor < input.length && input[cursor] === "\n") cursor += 1;
        continue;
      }
    }
    cursor = newline >= 0 ? newline + 1 : input.length;
  }
  return { assignments, hasExport, hasBare };
}

function findClosingQuote(input: string, start: number, quote: "'" | '"'): number {
  for (let i = start; i < input.length; i += 1) {
    if (input[i] === quote && input[i - 1] !== "\\") return i;
  }
  return -1;
}

/** Parse semicolon-separated ADO.NET key/value pairs while respecting quotes. */
export function parseAdonet(input: string): AdonetContext {
  const pairs: AdonetPair[] = [];
  let segmentStart = 0;
  let quote: "'" | '"' | undefined;
  for (let i = 0; i <= input.length; i += 1) {
    const current = input[i];
    if ((current === "'" || current === '"') && input[i - 1] !== "\\") quote = quote === current ? undefined : quote ?? current;
    if ((current === ";" && !quote) || i === input.length) {
      const segmentEnd = i;
      const segment = input.slice(segmentStart, segmentEnd);
      const equals = segment.indexOf("=");
      if (equals >= 0) {
        const rawKey = segment.slice(0, equals);
        const leftTrim = rawKey.match(/^\s*/u)?.[0].length ?? 0;
        const rightTrim = rawKey.match(/\s*$/u)?.[0].length ?? 0;
        const keyStart = segmentStart + leftTrim;
        const keyEnd = segmentStart + equals - rightTrim;
        let valueStart = segmentStart + equals + 1;
        while (valueStart < segmentEnd && /[ \t]/u.test(input[valueStart])) valueStart += 1;
        let valueEnd = segmentEnd;
        let pairQuote: "'" | '"' | undefined;
        if (input[valueStart] === "'" || input[valueStart] === '"') {
          pairQuote = input[valueStart] as "'" | '"';
          if (input[segmentEnd - 1] === pairQuote) {
            valueStart += 1;
            valueEnd -= 1;
          }
        }
        pairs.push({
          key: input.slice(keyStart, keyEnd),
          keyStart,
          keyEnd,
          value: input.slice(valueStart, valueEnd),
          valueStart,
          valueEnd,
          segmentStart,
          segmentEnd,
          quote: pairQuote,
        });
      }
      segmentStart = i + 1;
    }
  }
  return { pairs };
}

export function looksLikeAdonet(input: string): boolean {
  if (!input.includes(";")) return false;
  return parseAdonet(input).pairs.filter((pair) => ADONET_KEYS.has(pair.key.trim().toLowerCase())).length >= 2;
}

export function detectFormat(input: string): InputFormat {
  if (RECOGNIZED_URI.test(input)) return "uri";
  // ADO.NET strings also look like a one-line environment assignment. The
  // provider key vocabulary and semicolon delimiter are stronger evidence.
  if (looksLikeAdonet(input)) return "ado-net";
  if (input.split(/\r?\n/u).some((line) => /^\s*(?:export\s+)?[A-Z_][A-Z0-9_]*=/u.test(line))) return "env";
  if (/^\s*[\[{]/u.test(input) && /[\]}]\s*$/u.test(input)) return "json";
  if (isStrongSecretCandidate(input)) return "secret";
  return "unrecognized";
}

export function parseContext(input: string): ParseContext {
  const format = detectFormat(input);
  if (format === "uri") return { format, confidence: 1, uri: parseUri(input) };
  if (format === "env") return { format, confidence: 1, env: parseEnv(input) };
  if (format === "ado-net") return { format, confidence: 1, adonet: parseAdonet(input) };
  if (format === "json") return { format, confidence: 1 };
  if (format === "secret") return { format, confidence: 0.9 };
  return { format, confidence: 0 };
}

const DICTIONARY_WORDS = new Set(["supercalifragilisticexpialidocious"]);

/** Strong, deliberately conservative evidence for a standalone secret. */
export function isStrongSecretCandidate(input: string): boolean {
  if (input.length < 20 || /\s/u.test(input) || DICTIONARY_WORDS.has(input.toLowerCase())) return false;
  if (!/^[A-Za-z0-9_+./=-]+$/u.test(input)) return false;
  const frequencies = new Map<string, number>();
  for (const character of input) frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  let bits = 0;
  for (const count of frequencies.values()) {
    const probability = count / input.length;
    bits -= probability * Math.log2(probability);
  }
  const knownPrefix = /^(?:npg_|sk-|ghp_|AKIA|xoxb-)/u.test(input);
  const structuredHex = /^(?:[A-Fa-f0-9]{32}|[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64}|[A-Fa-f0-9-]{20,})$/u.test(input);
  const mixed = /[A-Za-z]/u.test(input) && /\d/u.test(input) && (/[A-Z]/u.test(input) || /[_+./=-]/u.test(input));
  return bits >= 3.5 && (knownPrefix || structuredHex || mixed);
}

export function isKnownScheme(scheme: string): boolean {
  return KNOWN_SCHEMES.has(scheme.toLowerCase());
}

export const ADONET_KEY_SET = ADONET_KEYS;
