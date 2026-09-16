/**
 * These settings are deliberately explicit. Tesseract's dictionaries can
 * rewrite credential-looking fragments into words, which is exactly the
 * silent mutation this app is intended to expose.
 */
export const TESSERACT_PARAMS = Object.freeze({
  load_system_dawg: "0",
  load_freq_dawg: "0",
  preserve_interword_spaces: "1",
});

export const OCR_PSM = Object.freeze({
  singleLine: 7,
  singleBlock: 6,
});

export const OCR_WORKER_OPTIONS = Object.freeze({
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract/tesseract-core.wasm.js",
  langPath: "/tessdata",
  // Tesseract's default cache uses IndexedDB. The demo promises no storage,
  // so every OCR job reads the language asset from the local build instead.
  cacheMethod: "none",
  // The postinstall stores the tessdata_fast file as eng.traineddata (not a
  // runtime .gz download), so the worker must request the uncompressed asset.
  gzip: false,
});

export type OcrPsm = (typeof OCR_PSM)[keyof typeof OCR_PSM];
