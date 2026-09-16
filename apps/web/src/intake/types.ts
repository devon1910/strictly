export interface IntakeSource {
  id: string;
  extract(input: unknown): Promise<{ text: string; confidence?: number; alternates?: import("./confusables").ConfusableCandidate[] }>;
}

export type OcrPhase =
  | "idle"
  | "loading"
  | "recognizing"
  | "complete"
  | "low-confidence"
  | "unsupported-image"
  | "failed";

export interface OcrState {
  phase: OcrPhase;
  message?: string;
  confidence?: number;
  fileName?: string;
  fileSize?: number;
}

export const OCR_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const OCR_MAX_BYTES = 10 * 1024 * 1024;
