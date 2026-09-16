import { describe, expect, it } from "vitest";
import { OCR_PSM, OCR_WORKER_OPTIONS, TESSERACT_PARAMS } from "./tesseractConfig";

describe("OCR safety configuration", () => {
  it("disables dictionary mutation and preserves spaces", () => {
    expect(TESSERACT_PARAMS).toMatchObject({
      load_system_dawg: "0",
      load_freq_dawg: "0",
      preserve_interword_spaces: "1",
    });
  });

  it("uses explicit single-line and single-block modes and local assets", () => {
    expect(OCR_PSM).toEqual({ singleLine: 7, singleBlock: 6 });
    expect(OCR_WORKER_OPTIONS).toEqual({
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/tesseract-core.wasm.js",
      langPath: "/tessdata",
      cacheMethod: "none",
      gzip: false,
    });
  });
});
