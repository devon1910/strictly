import type { Finding } from "strictly";
import { visibleCharacter } from "../diff";

interface VisibleTextProps {
  value: string;
  findings: Finding[];
  activeRange?: [number, number];
}

function inRange(index: number, range?: [number, number]): boolean {
  return Boolean(range && index >= range[0] && index < range[1]);
}

export function VisibleText({ value, findings, activeRange }: VisibleTextProps) {
  return (
    <div className="subject-text" aria-label="Input with invisible characters made visible">
      {Array.from(value).map((character, index) => {
        // Array.from indexes Unicode code points, while Finding ranges use
        // UTF-16 offsets. ASCII-sensitive values are usually one code unit;
        // use the prefix length to keep ranges correct for all input.
        const offset = value.slice(0, index).length;
        const nextOffset = offset + character.length;
        const visible = visibleCharacter(character);
        const affected = findings.some((finding) => {
          const range = finding.range;
          return Boolean(range && offset < range[1] && nextOffset > range[0]);
        });
        const selected = inRange(offset, activeRange) || inRange(Math.max(offset, nextOffset - 1), activeRange);
        return (
          <span
            className={`subject-character${affected ? " affected" : ""}${selected ? " selected" : ""}${visible.label ? " special" : ""}`}
            key={`${offset}-${character}`}
            title={visible.label}
            aria-label={visible.label ? `${visible.label} at position ${offset}` : `character at position ${offset}`}
          >
            {visible.text}
          </span>
        );
      })}
      {value.length === 0 ? <span className="empty-subject">Nothing pasted yet.</span> : null}
    </div>
  );
}
