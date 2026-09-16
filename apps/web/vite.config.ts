import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const here = path.dirname(fileURLToPath(import.meta.url));
const localPath = (relativePath: string) =>
  path.resolve(here, relativePath).replaceAll(path.sep, "/");

/**
 * Keep the OCR runtime local after installation. The worker and wasm files are
 * copied from node_modules into the build output; the language file is fetched
 * once by scripts/fetch-tessdata.mjs during postinstall.
 */
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: localPath("../../node_modules/tesseract.js/dist/worker.min.js"),
          dest: "tesseract",
          rename: { stripBase: true },
        },
        {
          src: localPath("../../node_modules/tesseract.js-core/tesseract-core.wasm.js"),
          dest: "tesseract",
          rename: { stripBase: true },
        },
        {
          src: localPath("../../node_modules/tesseract.js-core/tesseract-core.wasm"),
          dest: "tesseract",
          rename: { stripBase: true },
        },
        {
          // Keep the trust-surface fallback inside the Vite root. Copying an
          // external README is not reliable on all Windows glob versions.
          src: localPath("README.md"),
          dest: ".",
          rename: "README.md",
        },
      ],
    }),
  ],
  server: {
    fs: {
      allow: [path.resolve(here, "../..")],
    },
  },
});
