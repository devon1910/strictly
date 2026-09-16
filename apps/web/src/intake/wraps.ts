export interface WrapCandidate {
  label: string;
  result: string;
  reason: string;
  joinAt: number;
}

/**
 * OCR is allowed to return line breaks, but joining them changes a value. Keep
 * both plausible candidates separate so the user can inspect and choose one.
 */
export function getWrapCandidates(text: string): WrapCandidate[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const first = lines[0] ?? "";
  const trimmed = text.replace(/\r?\n/g, "");
  const withSpace = text.replace(/\r?\n/g, " ");
  const joinAt = first.length;
  const candidates: WrapCandidate[] = [
    {
      label: "Join wrapped lines (no space)",
      result: trimmed,
      reason: "The screenshot contains a line break; this candidate removes only that break.",
      joinAt,
    },
  ];

  if (!/[.!?,;:]$/.test(first.trim())) {
    candidates.push({
      label: "Join wrapped lines (with a space)",
      result: withSpace,
      reason: "A space may have separated the wrapped components; review it before copying.",
      joinAt,
    });
  }

  if (/-\s*\r?\n/.test(text)) {
    const keepHyphen = text.replace(/\r?\n/g, "");
    const dropHyphen = text.replace(/-\s*\r?\n/g, "");
    return [
      {
        label: "Join at hyphen (keep hyphen)",
        result: keepHyphen,
        reason: "The line ends in a hyphen, which may be part of a hostname or may be a wrap marker.",
        joinAt,
      },
      {
        label: "Join at hyphen (drop hyphen)",
        result: dropHyphen,
        reason: "The line ends in a hyphen; this candidate removes it as a possible wrap marker.",
        joinAt,
      },
    ];
  }
  return candidates;
}
