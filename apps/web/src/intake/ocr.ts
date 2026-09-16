import { lint } from "strictly";
import { OCR_PSM, OCR_WORKER_OPTIONS, TESSERACT_PARAMS, type OcrPsm } from "./tesseractConfig";
import { prepareImage, type ImageVariant } from "./preprocess";
import { OCR_ACCEPTED_TYPES, OCR_MAX_BYTES, type IntakeSource } from "./types";
import { deriveConfusableCandidates, type ConfusableCandidate } from "./confusables";

interface OcrResult {
  text: string;
  confidence: number;
  psm: OcrPsm;
  variant: ImageVariant;
  alternates?: ConfusableCandidate[];
}

interface RecognizedData {
  text: string;
  confidence: number;
  words?: Array<{ text: string; confidence: number }>;
}

interface TesseractWorker {
  setParameters(parameters: Record<string, string>): Promise<unknown>;
  recognize(image: unknown): Promise<{ data: RecognizedData }>;
  terminate(): Promise<unknown>;
}

interface TesseractModule {
  createWorker(
    language: string,
    oem: number,
    options: Record<string, unknown>,
  ): Promise<TesseractWorker>;
}

function scoreResult(result: OcrResult): number {
  const findings = lint(result.text).findings;
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const emptyPenalty = result.text.trim().length === 0 ? 100 : 0;
  return result.confidence - errors * 18 - warnings * 3 - emptyPenalty;
}

function isSuperseded(job: number, activeJob: number): boolean {
  return job !== activeJob;
}

/**
 * OCR remains an intake adapter. The rest of the UI only sees IntakeSource,
 * and can remove this module without changing the library or result renderer.
 */
export class OcrScreenshotSource implements IntakeSource {
  readonly id = "ocr-screenshot";
  private activeJob = 0;
  private activeWorker: TesseractWorker | undefined;

  async extract(input: unknown): Promise<{
    text: string;
    confidence?: number;
    alternates?: ConfusableCandidate[];
  }> {
    const job = ++this.activeJob;
    await this.cancelWorker();
    if (!(input instanceof Blob)) {
      throw new Error("Choose a PNG, JPEG or WebP screenshot.");
    }
    if (!OCR_ACCEPTED_TYPES.includes(input.type as (typeof OCR_ACCEPTED_TYPES)[number])) {
      throw new Error("Unsupported image. Use PNG, JPEG or WebP.");
    }
    if (input.size > OCR_MAX_BYTES) {
      throw new Error("That image is larger than 10 MB. Choose a smaller screenshot.");
    }

    const module = (await import("tesseract.js")) as unknown as TesseractModule;
    const variants: ImageVariant[] = ["original"];
    const results: OcrResult[] = [];
    try {
      for (const variant of variants) {
        const prepared = await prepareImage(input, variant);
        for (const psm of [OCR_PSM.singleLine, OCR_PSM.singleBlock] as OcrPsm[]) {
          if (isSuperseded(job, this.activeJob)) throw new Error("OCR superseded");
          const worker = await module.createWorker("eng", 1, OCR_WORKER_OPTIONS);
          this.activeWorker = worker;
          await worker.setParameters({
            ...TESSERACT_PARAMS,
            tessedit_pageseg_mode: String(psm),
          });
          const recognition = await worker.recognize(prepared.canvas);
          results.push(this.toResult(recognition.data, psm, variant));
          await worker.terminate();
          if (this.activeWorker === worker) this.activeWorker = undefined;
        }
      }

      const chosen = results.sort((left, right) => scoreResult(right) - scoreResult(left))[0];
      if (!chosen || isSuperseded(job, this.activeJob)) throw new Error("OCR superseded");

      // Escalate lazily only when the first pass is uncertain or structurally
      // suspicious. This keeps the common path quick and preserves the exact
      // text returned by the first pass for user comparison.
      const firstFindings = lint(chosen.text).findings;
      const poor = chosen.confidence < 72 || firstFindings.some((finding) => finding.severity === "error");
      if (poor) {
        let best = chosen;
        for (const variant of ["upscaled", "upscaled3", "inverted"] as ImageVariant[]) {
          const prepared = await prepareImage(input, variant);
          const fallback = await this.recognizeVariant(module, prepared.canvas, job, variant);
          if (fallback && scoreResult(fallback) > scoreResult(best)) best = fallback;
        }
        if (best !== chosen) {
          return { text: best.text, confidence: best.confidence, alternates: best.alternates };
        }
      }
      return { text: chosen.text, confidence: chosen.confidence, alternates: chosen.alternates };
    } finally {
      await this.cancelWorker();
    }
  }

  cancel(): void {
    this.activeJob += 1;
    void this.cancelWorker();
  }

  private async recognizeVariant(
    module: TesseractModule,
    canvas: HTMLCanvasElement,
    job: number,
    variant: ImageVariant,
  ): Promise<OcrResult | undefined> {
    if (isSuperseded(job, this.activeJob)) return undefined;
    const worker = await module.createWorker("eng", 1, OCR_WORKER_OPTIONS);
    this.activeWorker = worker;
    try {
      await worker.setParameters({
        ...TESSERACT_PARAMS,
        tessedit_pageseg_mode: String(OCR_PSM.singleBlock),
      });
      const recognized = await worker.recognize(canvas);
      return this.toResult(recognized.data, OCR_PSM.singleBlock, variant);
    } finally {
      await worker.terminate();
      if (this.activeWorker === worker) this.activeWorker = undefined;
    }
  }

  private async cancelWorker(): Promise<void> {
    const worker = this.activeWorker;
    this.activeWorker = undefined;
    if (worker) await worker.terminate();
  }

  private toResult(data: RecognizedData, psm: OcrPsm, variant: ImageVariant): OcrResult {
    return {
      text: data.text,
      confidence: data.confidence,
      psm,
      variant,
      alternates: deriveConfusableCandidates(data.text, data.confidence, data.words),
    };
  }
}

export function createOcrSource(): IntakeSource {
  return new OcrScreenshotSource();
}
