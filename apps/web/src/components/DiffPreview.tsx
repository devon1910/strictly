import { diffStrings, visibleCharacter } from "../diff";

interface DiffPreviewProps {
  original: string;
  proposed: string;
  label: string;
}

export function DiffPreview({ original, proposed, label }: DiffPreviewProps) {
  const segments = diffStrings(original, proposed);
  return (
    <div className="diff-preview" aria-label={`${label} character diff`}>
      {segments.map((segment, index) => (
        <span className={`diff-segment diff-${segment.kind}`} key={`${segment.kind}-${index}`}>
          {Array.from(segment.value).map((character, characterIndex) => {
            const visible = visibleCharacter(character);
            return (
              <span
                key={`${characterIndex}-${character}`}
                title={visible.label}
                aria-label={visible.label ? `${segment.kind} ${visible.label}` : undefined}
              >
                {visible.text}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
