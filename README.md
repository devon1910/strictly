# strictly

**Catches the bugs that connect successfully.**

strictly is a local-first linter for connection strings, credentials, and
environment variables. It catches characters and configuration mistakes that a
connectivity check cannot reliably explain: OCR-inserted whitespace, malformed
userinfo, a missing Neon pooler segment, or a Supabase session port where a
pooled port was intended.

The repository is a small monorepo:

```text
packages/strictly/   zero-runtime-dependency TypeScript library
apps/web/            static Vite/React demo and OCR intake
```

## Why a successful connection is not enough

There are two useful classes of findings:

1. A malformed value fails with a misleading runtime symptom. For example,
   an unencoded space in a password can surface as “password authentication
   failed”, while a space in a host can look like a DNS outage.
2. A structurally valid value is still the wrong value. A Neon direct endpoint
   can connect while a production workload needs the `-pooler` endpoint;
   `5432` can connect to Supabase while the application intended transaction
   pooling on `6543`; a valid URL can identify the wrong branch or project.

Parsing is therefore not proof that credentials are correct. strictly performs
static checks only and never attempts a connection.

## Exactness and privacy invariants

- `lint` never mutates its input and never substitutes a proposed result for
  the original. Fixes are separate complete values.
- No fix is auto-applied. The web app shows a character-level diff before a
  user chooses a version to copy.
- Original and proposed values are separate in both the API and UI.
- Copy actions require an explicit version and announce which version was
  copied.
- The library makes no network calls, console writes, environment reads, or
  time/randomness-dependent decisions. Its zero runtime dependency contract
  and no-I/O behavior are covered by tests.
- The web app has no backend, analytics, or storage. After the initial static
  assets load, it makes no network requests. Pasted text stays in memory.

If a live credential was pasted into an untrusted tool, rotate it. For Neon,
the URL is fixed for a branch, role, and database; the rotatable secret is the
role password.

## Library API

```ts
import { lint } from "strictly";

const result = lint(process.env.DATABASE_URL ?? "");
if (result.findings.some((finding) => finding.severity === "error")) {
  throw new Error(result.findings.map((finding) => finding.message).join("; "));
}
```

The result preserves the exact input and reports classification separately:

```ts
interface LintResult {
  input: string;
  format: "uri" | "env" | "ado-net" | "secret" | "json" | "unrecognized";
  confidence: number;
  findings: Finding[];
}
```

`unrecognized` is a successful, deliberately silent outcome. Universal
invisible/ambiguous-character checks still run, but format-specific rules run
only after positive structural identification.

Offsets are UTF-16 offsets into the exact input string. The parser shares one
`ParseContext` between rules so rules do not independently reinterpret the
same value. A custom registry can be supplied with `lint(input, { rules })`.

## Rule catalogue

The registry covers:

- invisible characters: zero-width characters, BOM, soft hyphen, Unicode
  spaces and dashes, smart quotes, CR/LF and tabs, controls, and non-ASCII
  machine-sensitive characters;
- URI structure for PostgreSQL, MySQL, MongoDB/MongoDB SRV, Redis/Rediss,
  including malformed schemes/separators, brackets, ports, query syntax,
  duplicate/unknown parameters, whitespace, and unencoded userinfo specials;
- provider hints for Neon and Supabase, with direct/pooler and session/
  transaction observations represented as non-error findings;
- dotenv assignments and multiline blocks, including absolute offset mapping
  when a value recursively contains a connection URI;
- ADO.NET key/value strings; and
- conservative generic secret observations for unambiguous token prefixes,
  UUID/hex shape, entropy, grouping, and OCR confusables.

Category-A findings include static `symptom` hints. Category-B observations
describe possible intent rather than claiming a connection is correct.

### Adding a rule

Create one module under `packages/strictly/src/rules/` implementing `Rule`,
add it to the registry in `packages/strictly/src/index.ts`, and add a focused
fixture test. Use `makeFix`/`replaceOne` to build a complete proposed result;
never edit the source value in place.

## Web app and OCR

Run the app from `apps/web`:

```sh
npm install
npm run dev
```

The text intake is the default and keeps focus on the editor. The output view
shows a ruler and character count, visible glyphs for invisible characters,
severity groups, range highlighting, original/proposed/manual diffs, reset,
and explicit copy selection. It is keyboard accessible and announces lint and
copy status through live regions.

Screenshot intake is an adapter implementing `IntakeSource`, so the output
view and library do not know about OCR internals. Tesseract runs in a worker
with dictionary correction disabled (`load_system_dawg: 0`,
`load_freq_dawg: 0`), preserved interword spaces, and PSM 7/6 selection.
Screenshots are accepted only as PNG, JPEG, or WebP and are capped at 10 MB.
Wrapped lines are never auto-joined: no-space, spaced, and hyphen keep/drop
candidates are proposed separately. Worker jobs are cancellable and stale
results are discarded.

The postinstall script downloads the `tessdata_fast` English model
(`eng.traineddata`) into `apps/web/public/tessdata/`; that generated
directory is gitignored. Vite copies the worker and wasm assets from installed
packages into the build so the deployed app does not fetch OCR assets from a
third-party CDN at runtime. If the model is not present, text linting still
works and OCR reports its failure state. The “Read the source” link uses the
optional `VITE_SOURCE_URL` build variable; without it, Vite copies this README
to the app’s output and the link remains local.

## Commands

From the repository root, run the package-specific commands while developing:

```sh
npm --prefix packages/strictly test
npm --prefix packages/strictly run typecheck
npm --prefix packages/strictly run lint
npm --prefix apps/web test
npm --prefix apps/web run typecheck
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

The library tests include the golden fixtures and contract checks. The app
tests exercise text intake, original-versus-proposed rendering, explicit copy
selection, reset, manual-edit relinting, and deterministic OCR adapter
configuration, wrap handling, and confusable suggestions without network
access.

## Known limitations and extension points

Static linting cannot prove that a password is current, that a branch/project
is the intended target, or that a server accepts a setting. It also cannot
recover characters that OCR dropped; its alternates are deliberately limited
to low-confidence positions in high-entropy segments. OCR preprocessing is
optimized for screenshots, not photographs, and image cropping/drag-and-drop
are deferred.

Additional providers (PlanetScale, Railway, Render, Upstash, Aiven), URL/CLI/
JSON rule groups, a CLI wrapper, editor integration, image secret masking, and
other deferred adapters can be added without changing the core API.

All credentials in this repository and its fixtures are synthetic examples.
