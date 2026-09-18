import { useEffect, useMemo, useRef, useState } from "react";
import type { Finding, Severity } from "strictly";
import { lint } from "strictly";
import { DiffPreview } from "./components/DiffPreview";
import { VisibleText } from "./components/VisibleText";
import { getWrapCandidates, type WrapCandidate } from "./intake/wraps";
import { getOcrUriCandidates } from "./intake/uriCleanup";
import { createOcrSource } from "./intake/ocr";
import type { ConfusableCandidate } from "./intake/confusables";
import type { IntakeSource, OcrState } from "./intake/types";

const DEFAULT_INPUT = "";
const INPUT_PLACEHOLDER =
  "postgresql://alex:AbC1 23dEf@ep-cool-darkness-a1b2c3d4-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require";
const SOURCE_URL = import.meta.env.VITE_SOURCE_URL?.trim() || "README.md";

type VersionId = "original" | "working" | `fix-${number}` | `wrap-${number}` | `uri-${number}` | `ocr-${number}`;

interface Version {
  id: VersionId;
  label: string;
  value: string;
  reason?: string;
}

const SEVERITIES: Severity[] = ["error", "warning", "info"];

function severityLabel(severity: Severity): string {
  return severity === "error" ? "Errors" : severity === "warning" ? "Warnings" : "Information";
}

function countLabel(findings: Finding[]): string {
  if (findings.length === 0) return "No findings";
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const info = findings.filter((finding) => finding.severity === "info").length;
  return [
    errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
    info ? `${info} info` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function App() {
  const [original, setOriginal] = useState(DEFAULT_INPUT);
  const [working, setWorking] = useState(DEFAULT_INPUT);
  const [selectedVersion, setSelectedVersion] = useState<VersionId>("original");
  const [activeRange, setActiveRange] = useState<[number, number] | undefined>();
  const [announcement, setAnnouncement] = useState("");
  const [ocrState, setOcrState] = useState<OcrState>({ phase: "idle" });
  const [ocrAlternates, setOcrAlternates] = useState<ConfusableCandidate[]>([]);
  const [intakeMode, setIntakeMode] = useState<"text" | "ocr">("text");
  const ocrSource = useMemo<IntakeSource>(() => createOcrSource(), []);
  const ocrRun = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const lintResult = useMemo(() => lint(working), [working]);
  const findings = lintResult.findings;
  const wrapCandidates = useMemo<WrapCandidate[]>(
    () => (intakeMode === "ocr" ? getWrapCandidates(working) : []),
    [intakeMode, working],
  );
  const uriCandidates = useMemo(
    () => (intakeMode === "ocr" ? getOcrUriCandidates(working) : []),
    [intakeMode, working],
  );
  const versions = useMemo<Version[]>(() => {
    const result: Version[] = [
      { id: "original", label: "Original intake", value: original },
      { id: "working", label: "Working copy (manual edits)", value: working },
    ];
    findings.forEach((finding, index) => {
      if (finding.fix) {
        result.push({
          id: `fix-${index}`,
          label: finding.fix.label,
          value: finding.fix.result,
          reason: finding.fix.reason,
        });
      }
    });
    wrapCandidates.forEach((candidate, index) => {
      result.push({
        id: `wrap-${index}`,
        label: candidate.label,
        value: candidate.result,
        reason: candidate.reason,
      });
    });
    uriCandidates.forEach((candidate, index) => {
      result.push({
        id: `uri-${index}`,
        label: candidate.label,
        value: candidate.result,
        reason: candidate.reason,
      });
    });
    ocrAlternates.forEach((candidate, index) => {
      result.push({
        id: `ocr-${index}`,
        label: candidate.label,
        value: candidate.result,
        reason: candidate.reason,
      });
    });
    return result;
  }, [findings, ocrAlternates, original, working, wrapCandidates, uriCandidates]);

  const selected = versions.find((version) => version.id === selectedVersion) ?? versions[0];
  const grouped = useMemo(
    () => Object.fromEntries(SEVERITIES.map((severity) => [severity, findings.filter((finding) => finding.severity === severity)])) as Record<Severity, Finding[]>,
    [findings],
  );

  useEffect(() => () => {
    if ("cancel" in ocrSource && typeof ocrSource.cancel === "function") ocrSource.cancel();
  }, [ocrSource]);

  function setInput(value: string, mode: "text" | "ocr" = "text") {
    setOriginal(value);
    setWorking(value);
    setSelectedVersion("original");
    setActiveRange(undefined);
    setIntakeMode(mode);
    if (mode !== "ocr") setOcrAlternates([]);
  }

  function handleManualEdit(value: string) {
    setWorking(value);
    setSelectedVersion("working");
    setAnnouncement("Working copy updated and re-linted.");
  }

  async function copyVersion(version: Version) {
    try {
      await navigator.clipboard.writeText(version.value);
      setAnnouncement(`Copied ${version.label} exactly.`);
    } catch {
      setAnnouncement("Copy was blocked by this browser. Select the value and copy it manually.");
    }
  }

  async function runOcr(file: File | Blob | null) {
    if (!file) return;
    const run = ++ocrRun.current;
    const fileName = file instanceof File && file.name ? file.name : "Pasted screenshot";
    const fileSize = file.size;
    setIntakeMode("ocr");
    setOcrState({ phase: "loading", fileName, fileSize, message: "Checking the image and preparing it for local OCR." });
    try {
      setOcrState({ phase: "recognizing", fileName, fileSize, message: "Reading the screenshot locally. This can take a little while on the first run." });
      const result = await ocrSource.extract(file);
      if (run !== ocrRun.current) return;
      setInput(result.text, "ocr");
      setOcrAlternates(result.alternates ?? []);
      if (result.confidence !== undefined && result.confidence < 72) {
        setOcrState({
          phase: "low-confidence",
          fileName,
          fileSize,
          confidence: result.confidence,
          message: "OCR confidence is low. Inspect every character before copying.",
        });
      } else {
        setOcrState({
          phase: "complete",
          fileName,
          fileSize,
          confidence: result.confidence,
          message: "Text was extracted into Original intake. Review it against the screenshot before selecting or copying any version.",
        });
      }
      setAnnouncement("Screenshot text extracted locally. Inspect the original before choosing a version.");
    } catch (error) {
      if (run !== ocrRun.current) return;
      const message = error instanceof Error ? error.message : "OCR could not read that screenshot.";
      const unsupported = /unsupported|PNG|JPEG|WebP|larger than 10 MB/i.test(message);
      setOcrState({ phase: unsupported ? "unsupported-image" : "failed", fileName, fileSize, message });
      setAnnouncement(message);
    }
  }

  function cancelOcr() {
    ocrRun.current += 1;
    if ("cancel" in ocrSource && typeof ocrSource.cancel === "function") ocrSource.cancel();
    setOcrState({ phase: "idle" });
    setAnnouncement("OCR cancelled. No extracted text was applied.");
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    if (image) {
      event.preventDefault();
      void runOcr(image);
    }
  }

  function reset() {
    ocrRun.current += 1;
    if ("cancel" in ocrSource && typeof ocrSource.cancel === "function") ocrSource.cancel();
    setOriginal("");
    setWorking("");
    setSelectedVersion("original");
    setActiveRange(undefined);
    setOcrState({ phase: "idle" });
    setOcrAlternates([]);
    setIntakeMode("text");
    setAnnouncement("State cleared. No value is retained by strictly.");
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <picture>
            <source srcSet="/strictly-mark-on-ink.svg" media="(prefers-color-scheme: dark)" />
            <img className="brand-mark" src="/strictly-mark.svg" alt="" width="96" height="96" />
          </picture>
          <div>
            <p className="eyebrow">LOCAL CONFIG INSPECTION / V1</p>
            <h1>strictly</h1>
            <p className="tagline">See the characters and structural mistakes hiding in copied configuration.</p>
          </div>
        </div>
        <div className="trust-stamp" aria-label="Privacy statement">
          <span className="trust-dot" aria-hidden="true" />
          <span>No network calls after load.<br />Nothing is stored.</span>
        </div>
      </header>

      <section className="intro" aria-labelledby="intro-title">
        <div>
          <p className="eyebrow">MORE THAN CONNECTION STRINGS</p>
          <h2 id="intro-title">Inspect the values your application actually receives.</h2>
        </div>
        <div className="intro-copy">
          <p>
            Paste configuration text or extract it from a screenshot. strictly checks structure
            and suspicious characters locally before they become misleading runtime errors.
          </p>
          <ul className="capability-list" aria-label="Supported input types">
            <li>Database and service URIs</li>
            <li><code>.env</code> blocks and ADO.NET</li>
            <li>Tokens, secrets and UUIDs</li>
            <li>JSON-like configuration</li>
            <li>Screenshot OCR</li>
          </ul>
        </div>
      </section>

      <section className="intake-section" aria-labelledby="intake-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 / INTAKE</p>
            <h2 id="intake-title">Bring the value here</h2>
          </div>
          <button type="button" className="quiet-button" onClick={reset}>Reset</button>
        </div>
        <div className="intake-tabs" role="tablist" aria-label="Input modes">
          <button
            type="button"
            role="tab"
            aria-selected={intakeMode === "text"}
            className={intakeMode === "text" ? "tab active" : "tab"}
            onClick={() => setIntakeMode("text")}
          >
            Paste text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={intakeMode === "ocr"}
            className={intakeMode === "ocr" ? "tab active" : "tab"}
            onClick={() => setIntakeMode("ocr")}
          >
            Screenshot / OCR
          </button>
        </div>
        <div className="intake-grid">
          <div className="paste-panel">
            <label htmlFor="original-input">Original intake</label>
            <p className="field-hint">Paste a URI, `.env` block, ADO.NET string, token, UUID, JSON-like config, or terminal output.</p>
            <textarea
              id="original-input"
              value={original}
              placeholder={INPUT_PLACEHOLDER}
              onChange={(event) => setInput(event.target.value)}
              onPaste={handlePaste}
              autoFocus
              spellCheck={false}
              aria-describedby="original-help"
            />
            <p id="original-help" className="field-hint">This is never silently changed. OCR images can also be pasted here.</p>
            {intakeMode === "ocr" ? (
              <div className="ocr-controls">
                <input
                  ref={fileInput}
                  id="screenshot-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    void runOcr(file);
                  }}
                />
                <label className="upload-button" htmlFor="screenshot-file">Choose screenshot</label>
                <span className="upload-hint">PNG, JPEG or WebP · max 10 MB</span>
              </div>
            ) : null}
            {ocrState.phase !== "idle" || ocrState.message ? (
              <div className={`ocr-status ocr-${ocrState.phase}`} role="status" aria-live="polite" aria-busy={ocrState.phase === "loading" || ocrState.phase === "recognizing"}>
                <div className="ocr-status-heading">
                  <div>
                    <span className="ocr-kicker">Screenshot OCR</span>
                    <strong>{ocrState.phase === "loading" ? "Preparing your image" : ocrState.phase === "recognizing" ? "Extracting text locally" : ocrState.phase === "low-confidence" ? "Text extracted — careful review needed" : ocrState.phase === "unsupported-image" ? "This image cannot be used" : ocrState.phase === "failed" ? "OCR could not finish" : "Text extracted — ready to review"}</strong>
                  </div>
                  {(ocrState.phase === "loading" || ocrState.phase === "recognizing") ? <span className="ocr-spinner" aria-hidden="true" /> : null}
                </div>
                {ocrState.fileName ? <span className="ocr-file"><b>{ocrState.fileName}</b>{ocrState.fileSize !== undefined ? ` · ${(ocrState.fileSize / 1024 / 1024).toFixed(2)} MB` : ""}</span> : null}
                {ocrState.message ? <span>{ocrState.message}</span> : null}
                {(ocrState.phase === "loading" || ocrState.phase === "recognizing") ? (
                  <ol className="ocr-steps" aria-label="OCR progress">
                    <li className="done">Image received</li>
                    <li className={ocrState.phase === "recognizing" ? "active" : ""}>Read characters</li>
                    <li>Show extracted text for review</li>
                  </ol>
                ) : null}
                {ocrState.confidence !== undefined ? <span>OCR confidence: {Math.round(ocrState.confidence)}%. This is not a correctness score.</span> : null}
                {(ocrState.phase === "complete" || ocrState.phase === "low-confidence") ? <span className="ocr-next"><b>Next:</b> compare Original intake with the screenshot, then inspect the character view below. Nothing has been fixed or copied automatically.</span> : null}
                {(ocrState.phase === "loading" || ocrState.phase === "recognizing") ? <button type="button" className="quiet-button ocr-cancel" onClick={cancelOcr}>Cancel OCR</button> : null}
              </div>
            ) : null}
          </div>
          <aside className="privacy-note" aria-label="Privacy and rotation warning">
            <p className="eyebrow">TRUST SURFACE</p>
            <h3>Local by design.</h3>
            <p>strictly makes no network calls after its assets load, and does not use localStorage, sessionStorage or IndexedDB.</p>
            <p><a href={SOURCE_URL} target="_blank" rel="noreferrer">Read the source ↗</a></p>
            <p className="warning-note"><strong>Live credential?</strong> If you pasted it into an untrusted tool, rotate it. A Neon URL is fixed for its branch, role and database; the role password is the part to rotate.</p>
          </aside>
        </div>
      </section>

      <section className="inspection-section" aria-labelledby="inspection-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">02 / INSPECTION</p>
            <h2 id="inspection-title">See every character</h2>
          </div>
          <div className="count-badge" aria-live="polite">
            {working.length} characters{original.length !== working.length ? ` / original ${original.length}` : ""}
          </div>
        </div>
        <div className="ruler" aria-hidden="true">
          {Array.from({ length: Math.max(1, Math.ceil(Math.max(working.length, 1) / 10)) }, (_, index) => (
            <span key={index}>{index * 10}</span>
          ))}
        </div>
        <div className="render-frame">
          <VisibleText value={working} findings={findings} activeRange={activeRange} />
        </div>
        <div className="legend" aria-label="Character legend">
          <span><i className="legend-dot affected-dot" aria-hidden="true" />Affected range</span>
          <span><i className="legend-dot selected-dot" aria-hidden="true" />Selected finding</span>
          <span><i aria-hidden="true">·</i> spaces</span>
          <span><i aria-hidden="true">↵</i> line feeds</span>
          <span><i aria-hidden="true">⟦ZWSP⟧</i> zero-width characters</span>
        </div>
      </section>

      <section className="working-section" aria-labelledby="working-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">03 / WORKING COPY</p>
            <h2 id="working-title">Edit deliberately</h2>
          </div>
          <button type="button" className="secondary-button" onClick={() => setWorking(original)}>Reset working copy</button>
        </div>
        <label htmlFor="working-input">Editable working copy</label>
        <p className="field-hint">Manual edits re-lint immediately and appear in the diff as manual changes.</p>
        <textarea
          id="working-input"
          value={working}
          onChange={(event) => handleManualEdit(event.target.value)}
          spellCheck={false}
        />
        <div className="manual-diff-block">
          <div className="diff-title"><span>Manual diff</span><span>original → working copy</span></div>
          <DiffPreview original={original} proposed={working} label="Manual edit" />
        </div>
      </section>

      <section className="findings-section" aria-labelledby="findings-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">04 / FINDINGS</p>
            <h2 id="findings-title">What deserves a second look</h2>
          </div>
          <div className="count-badge" aria-live="polite">{countLabel(findings)}</div>
        </div>
        {lintResult.format === "unrecognized" ? (
          <div className="empty-findings" role="status">
            No known format was recognized. Invisible and ambiguous characters were still checked; strictly does not guess from punctuation or prose.
          </div>
        ) : <p className="section-note">Recognized format: {lintResult.format}. A clean parse is not proof of a correct provider, branch, project, role or database.</p>}
        {findings.length === 0 && lintResult.format !== "unrecognized" ? (
          <div className="empty-findings" role="status">No structural observations for this input. Verify the target and credentials out of band.</div>
        ) : findings.length > 0 ? (
          <div className="finding-groups">
            {SEVERITIES.map((severity) => grouped[severity].length > 0 ? (
              <div className={`finding-group group-${severity}`} key={severity}>
                <h3>{severityLabel(severity)}</h3>
                <div className="finding-list">
                  {grouped[severity].map((finding) => {
                    const globalIndex = findings.indexOf(finding);
                    return (
                      <article className="finding" key={`${finding.code}-${globalIndex}`}>
                        <button
                          type="button"
                          className="finding-main"
                          onMouseEnter={() => setActiveRange(finding.range)}
                          onFocus={() => setActiveRange(finding.range)}
                          onMouseLeave={() => setActiveRange(undefined)}
                          onBlur={() => setActiveRange(undefined)}
                          aria-label={`Highlight ${finding.message}`}
                        >
                          <span className="finding-code">{finding.code}</span>
                          <span className="finding-message">{finding.message}</span>
                          {finding.range ? <span className="finding-range">positions {finding.range[0]}–{finding.range[1] - 1}</span> : null}
                        </button>
                        <div className="finding-detail">
                          <p>{finding.detail}</p>
                          {finding.symptom ? <p className="symptom"><strong>Runtime symptom:</strong> {finding.symptom}</p> : null}
                          {finding.fix ? (
                            <div className="fix-block">
                              <div className="fix-heading"><span>Proposed fix</span><button type="button" onClick={() => setSelectedVersion(`fix-${globalIndex}`)}>Select for copy</button></div>
                              <p>{finding.fix.reason}</p>
                              <DiffPreview original={working} proposed={finding.fix.result} label={finding.fix.label} />
                              <span className="not-applied">Not applied</span>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null)}
          </div>
        ) : null}
      </section>

      {wrapCandidates.length > 0 ? (
        <section className="wrap-section" aria-labelledby="wrap-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OCR / WRAP CHECK</p>
              <h2 id="wrap-title">A line break is a mutation point</h2>
            </div>
          </div>
          <p className="section-note">No line is joined automatically. Choose a candidate only after comparing it with the screenshot.</p>
          <div className="candidate-list">
            {wrapCandidates.map((candidate, index) => (
              <article className="candidate" key={`${candidate.label}-${index}`}>
                <div><h3>{candidate.label}</h3><p>{candidate.reason}</p></div>
                <DiffPreview original={working} proposed={candidate.result} label={candidate.label} />
                <button type="button" className="secondary-button" onClick={() => setSelectedVersion(`wrap-${index}`)}>Select for copy</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {ocrAlternates.length > 0 ? (
        <section className="confusable-section" aria-labelledby="confusable-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OCR / CONFUSABLE CHECK</p>
              <h2 id="confusable-title">Low-confidence characters need a human</h2>
            </div>
          </div>
          <p className="section-note">These are bounded alternates from a confusable table, generated only inside high-entropy segments. None is applied automatically.</p>
          <div className="candidate-list">
            {ocrAlternates.map((candidate, index) => (
              <article className="candidate" key={`${candidate.label}-${index}`}>
                <div><h3>{candidate.label}</h3><p>{candidate.reason}</p></div>
                <DiffPreview original={working} proposed={candidate.result} label={candidate.label} />
                <button type="button" className="secondary-button" onClick={() => setSelectedVersion(`ocr-${index}`)}>Select for copy</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="copy-section" aria-labelledby="copy-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">05 / COPY</p>
            <h2 id="copy-title">Choose exactly one version</h2>
          </div>
          <span className="selected-label">Selected: {selected?.label ?? "Original intake"}</span>
        </div>
        <div className="version-picker" role="radiogroup" aria-label="Version to copy">
          {versions.map((version) => (
            <label className={`version-option${selected?.id === version.id ? " selected" : ""}`} key={version.id}>
              <input
                type="radio"
                name="copy-version"
                checked={selected?.id === version.id}
                onChange={() => setSelectedVersion(version.id)}
              />
              <span><strong>{version.label}</strong>{version.reason ? <small>{version.reason}</small> : null}</span>
            </label>
          ))}
        </div>
        <button type="button" className="copy-button" onClick={() => selected && void copyVersion(selected)} disabled={!selected || selected.value.length === 0}>
          Copy selected version
        </button>
        <div className="sr-only" aria-live="polite">{announcement}</div>
      </section>

      <footer className="footer">
        <span>strictly / pure inspection, explicit changes</span>
        <span>Rotate values pasted into untrusted tools.</span>
      </footer>
    </main>
  );
}

export default App;
