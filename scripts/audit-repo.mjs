import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ignoredDirectories = new Set(["node_modules", "dist", "tessdata", ".git"]);
const suspiciousPatterns = [
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub personal token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { label: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(path)));
    else result.push(path);
  }
  return result;
}

const candidates = [join(root, "README.md"), ...(await filesUnder(join(root, "packages"))), ...(await filesUnder(join(root, "apps")))];
const findings = [];
for (const path of candidates) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch {
    continue;
  }
  for (const { label, pattern } of suspiciousPatterns) {
    for (const match of source.matchAll(pattern)) {
      findings.push(`${relative(root, path).split(sep).join("/")}: ${label} near offset ${match.index}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential live credential material found:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log("No unmistakable live-token or private-key patterns found in app/library sources.");
}
