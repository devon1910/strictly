export interface OcrUriCandidate {
  label: string;
  result: string;
  reason: string;
}

const URI_SCHEMES = ["postgresql", "postgres", "mysql", "mongodb+srv", "mongodb", "rediss", "redis"];

/**
 * Build an explicit, reviewable URI reconstruction from noisy OCR. The raw OCR
 * result remains untouched. This is deliberately limited to text which has a
 * recognizable URI scheme and authority marker.
 */
export function getOcrUriCandidates(text: string): OcrUriCandidate[] {
  const compact = text
    .trim()
    // A wrapped ".neon.tech" suffix is sometimes read as "-Neon. tech".
    // Keep this repair tied to the provider suffix instead of removing every
    // leading hyphen after a line break.
    .replace(/\s*[\r\n]+\s*-\s*neon\s*\./gi, ".neon.")
    .replace(/\s*[\r\n]+\s*/g, "")
    .replace(/\s*([:/@.?&=])\s*/g, "$1");

  const schemeMatch = compact.match(/^([a-z+]+):\/\//i);
  if (!schemeMatch) return [];
  const recognizedScheme = URI_SCHEMES.find(
    (scheme) => scheme.toLowerCase() === schemeMatch[1]?.toLowerCase(),
  );
  if (!recognizedScheme) return [];

  let reconstructed = recognizedScheme + compact.slice(schemeMatch[1]!.length);
  const authorityStart = reconstructed.indexOf("://") + 3;
  const authorityTail = reconstructed.slice(authorityStart);
  const authorityDelimiter = authorityTail.search(/[/?#]/);
  const authorityEnd = authorityDelimiter === -1 ? -1 : authorityStart + authorityDelimiter;
  let authority = reconstructed.slice(
    authorityStart,
    authorityEnd === -1 ? reconstructed.length : authorityEnd,
  );

  // For Neon URIs the first @ after user:password is the credential separator.
  // Any later @ is inside the endpoint hostname, where OCR commonly confuses
  // the adjacent zero in an endpoint id for @. DNS hostnames are case-insensitive
  // and conventionally rendered lowercase.
  const credentialAt = authority.indexOf("@");
  const credentials = credentialAt === -1 ? "" : authority.slice(0, credentialAt);
  let hostname = credentialAt === -1 ? authority : authority.slice(credentialAt + 1);
  if (credentials.includes(":") && /^ep-/i.test(hostname)) {
    const neonHostname = hostname
      .replace(/([a-z0-9])@([a-z0-9])/gi, (_match, left: string, right: string) => `${left}0${right}`)
      .replace(/\.azure-neon\./gi, ".azure.neon.")
      .toLowerCase();
    // Do not infer credential or hostname structure for other providers. This
    // repair is enabled only when the complete reconstructed DNS suffix proves
    // that the screenshot contains a Neon endpoint.
    if (/(?:^|\.)neon\.tech(?::\d+)?$/.test(neonHostname)) {
      hostname = neonHostname;
      const normalizedAuthority = `${credentials}@${hostname}`;
      reconstructed = reconstructed.slice(0, authorityStart) + normalizedAuthority
        + reconstructed.slice(authorityEnd === -1 ? reconstructed.length : authorityEnd);
      authority = normalizedAuthority;
    }
  }

  const passwordMatch = authority.match(/^([^:]+):([^@]+)@/);

  // Password managers commonly render secrets as a run of asterisks. At this
  // font size Tesseract often reads individual '*' glyphs as x, %, or «. Only
  // canonicalize when the whole password is made of those mask-like glyphs;
  // never rewrite a normal mixed password.
  if (passwordMatch && /^[*xX%«»]+$/.test(passwordMatch[2]!)) {
    const masked = "*".repeat(Array.from(passwordMatch[2]!).length);
    const offset = reconstructed.indexOf(passwordMatch[2]!, authorityStart);
    reconstructed = reconstructed.slice(0, offset) + masked + reconstructed.slice(offset + passwordMatch[2]!.length);
  }

  if (reconstructed === text) return [];
  const candidates: OcrUriCandidate[] = [{
    label: /(?:^|\.)neon\.tech(?::\d+)?$/.test(hostname)
      ? "Reconstruct OCR Neon database URI"
      : "Reconstruct OCR database URI",
    result: reconstructed,
    reason: "Removes OCR spacing at URI delimiters, joins wrapped hostnames, normalizes the recognized scheme, and restores a mask-like password run. Compare the result and password length with the screenshot before copying.",
  }];

  // Masking widgets frequently display a fixed 16-glyph placeholder, while
  // OCR can split one star into multiple marks. Offer that common rendering as
  // a separate candidate instead of guessing silently.
  if (passwordMatch && /^[*xX%«»]+$/.test(passwordMatch[2]!) && passwordMatch[2]!.length !== 16) {
    const currentMask = "*".repeat(Array.from(passwordMatch[2]!).length);
    candidates.unshift({
      label: "Reconstruct OCR database URI (16-character mask)",
      result: reconstructed.replace(`:${currentMask}@`, `:${"*".repeat(16)}@`),
      reason: "Uses the common fixed 16-character password placeholder because OCR may split mask glyphs. Confirm the displayed mask length against the screenshot before copying.",
    });
  }
  return candidates;
}
