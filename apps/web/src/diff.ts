export type DiffKind = "same" | "removed" | "added";

export interface DiffSegment {
  kind: DiffKind;
  value: string;
}

/**
 * A small character diff for credential-sized values. Common prefixes and
 * suffixes are kept verbatim so the changed character(s) stay obvious. For
 * unusually large paste blocks, use a linear fallback rather than allowing a
 * quadratic UI update to freeze the page.
 */
export function diffStrings(original: string, proposed: string): DiffSegment[] {
  if (original === proposed) return [{ kind: "same", value: original }];
  let prefix = 0;
  const maxPrefix = Math.min(original.length, proposed.length);
  while (prefix < maxPrefix && original[prefix] === proposed[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < original.length - prefix &&
    suffix < proposed.length - prefix &&
    original[original.length - 1 - suffix] === proposed[proposed.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const segments: DiffSegment[] = [];
  if (prefix > 0) segments.push({ kind: "same", value: original.slice(0, prefix) });
  const removed = original.slice(prefix, original.length - suffix || undefined);
  const added = proposed.slice(prefix, proposed.length - suffix || undefined);
  if (removed) segments.push({ kind: "removed", value: removed });
  if (added) segments.push({ kind: "added", value: added });
  if (suffix > 0) segments.push({ kind: "same", value: original.slice(original.length - suffix) });
  return segments;
}

export function visibleCharacter(value: string): { text: string; label?: string } {
  switch (value) {
    case " ":
      return { text: "·", label: "space" };
    case "\t":
      return { text: "⇥", label: "tab" };
    case "\r":
      return { text: "␍", label: "carriage return" };
    case "\n":
      return { text: "↵\n", label: "line feed" };
    case "\u00a0":
      return { text: "⍽", label: "non-breaking space" };
    case "\u200b":
      return { text: "⟦ZWSP⟧", label: "zero-width space" };
    case "\u200c":
      return { text: "⟦ZWNJ⟧", label: "zero-width non-joiner" };
    case "\u200d":
      return { text: "⟦ZWJ⟧", label: "zero-width joiner" };
    case "\ufeff":
      return { text: "⟦BOM⟧", label: "byte order mark" };
    case "\u00ad":
      return { text: "⟦SHY⟧", label: "soft hyphen" };
    default:
      if (/^[\u0000-\u001f\u007f]$/u.test(value)) {
        return { text: `⟦U+${value.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}⟧`, label: "control character" };
      }
      if (/^\s$/u.test(value)) return { text: "·", label: "unicode whitespace" };
      return { text: value };
  }
}
