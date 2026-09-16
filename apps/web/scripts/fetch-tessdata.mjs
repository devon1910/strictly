import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "public/tessdata/eng.traineddata");
const url = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata";

if (process.env.STRICTLY_SKIP_TESSDATA === "1") {
  console.log("strictly: skipping tessdata download (STRICTLY_SKIP_TESSDATA=1)");
  process.exit(0);
}

try {
  await mkdir(dirname(destination), { recursive: true });
  try {
    const existing = await stat(destination);
    if (existing.size > 0) {
      console.log("strictly: local tessdata/eng.traineddata already exists");
      process.exit(0);
    }
  } catch {
    // The file is not present yet; fetch it below.
  }
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const contents = Buffer.from(await response.arrayBuffer());
  if (contents.length < 1_000_000) throw new Error("download was unexpectedly small");
  await writeFile(destination, contents);
  console.log(`strictly: installed local tessdata/eng.traineddata (${contents.length} bytes)`);
} catch (error) {
  console.error(
    `strictly: required tessdata download failed (${error instanceof Error ? error.message : String(error)}). Retry postinstall before building the OCR app.`,
  );
  process.exitCode = 1;
}
