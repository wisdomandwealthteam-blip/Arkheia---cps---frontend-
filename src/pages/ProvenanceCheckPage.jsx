// MusicGuard studio additions are deliberately scoped to this page only.
import { useEffect, useRef, useState } from "react";
import FormField from "../components/FormField";
import { downloadReceipt } from "../components/VerificationGatePage";
import { api } from "../utils/apiClient";
import { maskAccountNumber } from "../utils/redaction";
import { createRequestGuard } from "../utils/governance";
import {
  ARCHITECTURE_VERSION, buildGatePayload, gateConfig, gateSample,
  initialGateForm, validateGateReceipt,
} from "../utils/verificationGates";

const STEPS = [
  { n: 1, label: "Input + redaction" },
  { n: 2, label: "Redacted preview" },
  { n: 3, label: "Full receipt" },
];
const ROYALTY_ROLES = ["Artist", "Producer", "Songwriter", "Distributor"];
const AUDIO_ACCEPT = "audio/*,.wav,.mp3,.flac,.aiff,.m4a";
const SECONDARY_BUTTON = "focus-ring rounded border border-ink/20 px-5 py-2.5 font-display text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50";
const PRIMARY_BUTTON = "focus-ring rounded bg-signal px-5 py-2.5 font-display text-sm font-medium text-white transition hover:bg-signal/90 disabled:opacity-50";

function royaltySplits(value) {
  const parts = value.trim() ? value.split(",").map((part) => part.trim()) : [];
  const integers = parts.every((part) => /^[+-]?\d+$/.test(part) && Number.isSafeInteger(Number(part)));
  const numbers = integers ? parts.map(Number) : [];
  const valid = integers && parts.length <= 4 && numbers.every((number) => number >= 0 && number <= 10000);
  return {
    valid,
    values: ROYALTY_ROLES.map((_, index) => valid ? numbers[index] || 0 : 0),
    total: numbers.reduce((sum, number) => sum + number, 0),
    notice: valid ? "" : "Use up to four integer splits between 0 and 10000, in Artist, Producer, Songwriter, Distributor order. Invalid text is not replaced or silently conserved.",
  };
}

export default function ProvenanceCheckPage({ apiKey }) {
  const config = gateConfig("provenance");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => initialGateForm("provenance"));
  const [submitted, setSubmitted] = useState(null);
  const [preview, setPreview] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioInfo, setAudioInfo] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const requestGuard = useRef(createRequestGuard());
  const hashGuard = useRef(createRequestGuard());
  const splits = royaltySplits(form.splits_bps);

  useEffect(() => {
    const requests = requestGuard.current;
    const hashes = hashGuard.current;
    return () => { requests.invalidate(); hashes.invalidate(); };
  }, []);

  function invalidateResults() {
    requestGuard.current.invalidate();
    hashGuard.current.invalidate();
    setStep(1);
    setSubmitted(null);
    setPreview(null);
    setReceipt(null);
    setError(null);
    setPreviewLoading(false);
    setAudioLoading(false);
  }

  const setField = (field) => (value) => {
    invalidateResults();
    if (field === "audio_fingerprint_sha256") {
      setAudioInfo(null);
      setAudioError(null);
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  function loadSample(compliant) {
    invalidateResults();
    setAudioInfo(null);
    setAudioError(null);
    const sample = gateSample("provenance", compliant);
    setForm({ ...sample, splits_bps: royaltySplits(sample.splits_bps).values.join(", ") });
  }

  async function hashAudioFile(file) {
    if (!file) return;
    invalidateResults();
    const token = hashGuard.current.invalidate();
    setAudioInfo(null);
    setAudioError(null);
    setAudioLoading(true);
    setForm((current) => ({ ...current, audio_fingerprint_sha256: "" }));
    try {
      if (!/^audio\//i.test(file.type || "") && !/\.(wav|mp3|flac|aiff|m4a)$/i.test(file.name || "")) {
        throw new Error("Choose an audio file (.wav, .mp3, .flac, .aiff, .m4a, or audio/*).");
      }
      if (!window.crypto?.subtle?.digest) {
        throw new Error("Local SHA-256 hashing requires Web Crypto in a secure browser context (HTTPS or localhost). No audio was uploaded.");
      }
      const arrayBuffer = await file.arrayBuffer();
      if (!hashGuard.current.isCurrent(token)) return;
      // File bytes stay on this device. Only the resulting digest enters the form.
      const digest = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
      if (!hashGuard.current.isCurrent(token)) return;
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Unable to generate a valid local SHA-256 digest. No audio was uploaded.");
      setForm((current) => ({ ...current, audio_fingerprint_sha256: sha256 }));
      setAudioInfo({ name: file.name, size: file.size });
    } catch (err) {
      if (hashGuard.current.isCurrent(token)) setAudioError(err.message || "Unable to hash this audio file locally. No audio was uploaded.");
    } finally {
      if (hashGuard.current.isCurrent(token)) setAudioLoading(false);
    }
  }

  function setRoyaltySplit(index, value) {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 0 || amount > 10000 || amount % 50 !== 0) return;
    const values = [...splits.values];
    values[index] = amount;
    setField("splits_bps")(values.join(", "));
  }

  async function handlePreviewSubmit(event) {
    event.preventDefault();
    if (audioLoading) return;
    invalidateResults();
    const token = requestGuard.current.invalidate();
    setPreviewLoading(true);
    try {
      if (!splits.valid) throw new Error(splits.notice);
      const payload = buildGatePayload("provenance", form);
      const result = validateGateReceipt("provenance", await api.provenanceCheck(payload, apiKey));
      if (!requestGuard.current.isCurrent(token)) return;
      setSubmitted(payload);
      setPreview(result);
      setStep(2);
    } catch (err) {
      if (requestGuard.current.isCurrent(token)) setError(err);
    } finally {
      if (requestGuard.current.isCurrent(token)) setPreviewLoading(false);
    }
  }

  function viewReceipt() {
    if (!preview) return;
    hashGuard.current.invalidate();
    setReceipt(validateGateReceipt("provenance", preview));
    setError(null);
    setStep(3);
  }

  function backToPreview() {
    requestGuard.current.invalidate();
    hashGuard.current.invalidate();
    setReceipt(null);
    setError(null);
    setStep(2);
  }

  function restart() {
    invalidateResults();
    setForm(initialGateForm("provenance"));
    setAudioInfo(null);
    setAudioError(null);
    setDragActive(false);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="font-display text-xs uppercase tracking-[0.2em] text-signal">{config.brand}</p>
        <h1 className="font-display text-3xl font-semibold text-ink">{config.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink/60">{config.description} Review the redacted gate preview, then view its full SHA-256 audit receipt.</p>
      </header>

      <WalkthroughDrawer open={walkthroughOpen} error={videoError}
        onToggle={() => setWalkthroughOpen((open) => !open)} onError={() => setVideoError(true)} />

      <ol aria-label="ProvenanceCheck steps" className="flex flex-wrap items-center gap-2">
        {STEPS.map((item, index) => (
          <li key={item.n} className="flex items-center gap-2">
            <button type="button" aria-current={step === item.n ? "step" : undefined} disabled={item.n >= step}
              onClick={() => item.n === 1 ? invalidateResults() : backToPreview()}
              className={`focus-ring flex items-center gap-2 rounded px-2 py-1 font-display text-xs ${item.n === step ? "text-ink" : item.n < step ? "text-ink/50 hover:text-ink" : "cursor-default text-ink/30"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${item.n === step ? "border-signal bg-signal text-white" : "border-ink/15 text-ink/40"}`}>{item.n}</span>{item.label}
            </button>
            {index < STEPS.length - 1 && <span aria-hidden="true" className="text-ink/20">→</span>}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <form onSubmit={handlePreviewSubmit} className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <div className="space-y-6">
            <section aria-label="Synthetic examples" className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => loadSample(false)} className={`${SECONDARY_BUTTON} border-risk-high/30 text-risk-high`}>Load Defective Music Provenance (Triggers HOLD)</button>
                <button type="button" onClick={() => loadSample(true)} className={`${SECONDARY_BUTTON} border-risk-low/30 text-risk-low`}>Load Compliant Music Provenance (Triggers PASS)</button>
              </div>
              <p className="text-xs leading-relaxed text-ink/50">Synthetic examples only. Loading an example prefills editable inputs; nothing is sent until you generate a preview.</p>
            </section>

            <section aria-labelledby="provenance-input-heading" className="space-y-4 rounded border border-ink/10 bg-white p-6">
              <h2 id="provenance-input-heading" className="font-display text-lg font-semibold text-ink">Recording provenance</h2>
              <FormField id="provenance-isrc" label="ISRC (operational recording code)" type="text" value={form.isrc} onChange={setField("isrc")} required={false} hint={config.fields[0].hint} />
              <AudioHashDropzone loading={audioLoading} info={audioInfo} error={audioError}
                dragActive={dragActive} onDragActive={setDragActive} onFile={hashAudioFile} />
              <FormField id="provenance-audio_fingerprint_sha256" label="Audio fingerprint SHA-256" type="text" value={form.audio_fingerprint_sha256} onChange={setField("audio_fingerprint_sha256")} required={false} hint={config.fields[1].hint} />
              <label htmlFor="provenance-rights_cleared" className="flex items-start gap-3 rounded border border-ink/10 p-3 font-display text-sm text-ink">
                <input id="provenance-rights_cleared" type="checkbox" checked={form.rights_cleared} onChange={(event) => setField("rights_cleared")(event.target.checked)} className="focus-ring mt-0.5 accent-signal" />
                <span>Rights chain cleared<span className="mt-1 block text-xs font-normal text-ink/50">{config.fields[2].hint}</span></span>
              </label>
              <RoyaltySliders splits={splits} onChange={setRoyaltySplit} />
              <FormField id="provenance-splits_bps" label="Splits (integer basis points)" type="text" value={form.splits_bps} onChange={setField("splits_bps")} required={false} hint="Comma-separated integers in Artist, Producer, Songwriter, Distributor order. Missing trailing roles are zero; sliders and text stay synchronized." />
            </section>

            <section aria-labelledby="provenance-context-heading" className="space-y-4 rounded border border-ink/10 bg-white p-6">
              <h2 id="provenance-context-heading" className="font-display text-lg font-semibold text-ink">Configured policy & context</h2>
              <div className="flex flex-col gap-1">
                <label htmlFor="provenance-subject" className="font-display text-sm font-medium text-ink">Subject reference (masked locally)</label>
                <input id="provenance-subject" type="password" autoComplete="off" spellCheck={false} maxLength={64} value={form.subject_reference} onChange={(event) => setField("subject_reference")(event.target.value)} aria-describedby="provenance-subject-hint" className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink" />
                <p id="provenance-subject-hint" className="break-all text-xs text-ink/45">Masked reference: {maskAccountNumber(form.subject_reference) || "—"}. Optional; use a synthetic or internal reference only.</p>
              </div>
            </section>
            <ErrorNotice error={error} />
            <button type="submit" disabled={previewLoading || audioLoading} className={`${PRIMARY_BUTTON} w-full`}>{previewLoading ? "Generating preview..." : "Generate redacted preview →"}</button>
            {previewLoading && <p role="status" className="text-xs text-ink/55">Evaluating configured rules. Editing inputs or loading a preset discards this pending result.</p>}
          </div>
          <aside className="h-fit rounded border border-ink/10 bg-ink p-5 font-display text-paper lg:sticky lg:top-6">
            <h2 className="text-xs uppercase tracking-wide text-paper/60">Local redaction — what gets transmitted</h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div><dt className="text-paper/50">Subject reference</dt><dd className="mt-1 break-all font-mono text-paper/90">{maskAccountNumber(form.subject_reference) || "—"}</dd></div>
              <div><dt className="text-paper/50">Operational fields</dt><dd className="mt-1 leading-relaxed text-paper/80">ISRC, audio fingerprint SHA-256, rights clearance declaration, and integer royalty splits. No audio files or filenames are transmitted.</dd></div>
            </dl>
            <p className="mt-5 border-t border-paper/15 pt-4 text-xs leading-relaxed text-paper/70">PII notice: do not enter names, emails, SSNs, or other personal data. Identifiers and hashes are operational codes. The subject reference is masked before any preview or transmission. Raw references and audio bytes never leave this device; inputs are not saved to browser storage.</p>
            <p className="mt-4 text-[11px] leading-relaxed text-paper/55">The conservation bar is local arithmetic only, not a backend gate receipt. HOLD means stop and review; PASS is limited to configured rules, not legal authorization.</p>
            <p className="mt-4 break-all font-mono text-[10px] text-paper/40">{ARCHITECTURE_VERSION}</p>
          </aside>
        </form>
      )}

      {step === 2 && preview && (
        <div className="space-y-6">
          <section className="space-y-5 rounded border border-ink/10 bg-white p-6">
            <div><h2 className="font-display text-lg font-semibold text-ink">Redacted preview</h2><p className="mt-1 break-all font-mono text-[11px] text-ink/45">{preview.receipt_id}</p></div>
            <GateFindings receipt={preview} />
            <div className="border-t border-ink/10 pt-4">
              <h3 className="font-display text-xs uppercase tracking-wide text-ink/50">Redacted input submitted</h3>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded bg-paper p-4 text-xs leading-relaxed text-ink/75">{JSON.stringify(submitted, null, 2)}</pre>
            </div>
          </section>
          <div className="flex flex-wrap gap-3"><button type="button" onClick={invalidateResults} className={SECONDARY_BUTTON}>← Edit inputs</button><button type="button" onClick={viewReceipt} className={PRIMARY_BUTTON}>View full receipt →</button></div>
        </div>
      )}

      {step === 3 && receipt && (
        <div className="space-y-6">
          <section className="space-y-5 rounded border border-ink/10 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Full audit receipt</h2>
            <GateFindings receipt={receipt} />
            <dl className="space-y-4 border-t border-ink/10 pt-5">
              <ReceiptField label="Receipt ID" value={receipt.receipt_id} /><ReceiptField label="SHA-256 digest" value={receipt.sha256} />
              <ReceiptField label="Architecture version" value={receipt.architecture_version} /><ReceiptField label="Evaluated at (UTC)" value={receipt.timestamp} />
            </dl>
            <button type="button" onClick={() => downloadReceipt(receipt)} className={SECONDARY_BUTTON}>Download JSON receipt</button>
          </section>
          <div className="flex flex-wrap gap-3"><button type="button" onClick={backToPreview} className={SECONDARY_BUTTON}>← Back to preview</button><button type="button" onClick={restart} className={SECONDARY_BUTTON}>Start a new check</button></div>
        </div>
      )}
    </div>
  );
}

function WalkthroughDrawer({ open, error, onToggle, onError }) {
  return (
    <section className="rounded border border-ink/10 bg-white">
      <button type="button" aria-expanded={open} aria-controls="musicguard-walkthrough" onClick={onToggle}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded px-6 py-4 text-left font-display text-sm font-medium text-ink">
        <span>Watch MusicGuard Overview (60s)</span><span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id="musicguard-walkthrough" className="space-y-3 border-t border-ink/10 p-6">
          {error ? (
            <p role="status" className="rounded bg-paper p-4 text-sm leading-relaxed text-ink/65">Drop musicguard-overview.mp4 into public/videos/ to enable the narrated executive walkthrough.</p>
          ) : (
            <video controls preload="metadata" src="/videos/musicguard-overview.mp4" onError={onError}
              className="w-full rounded bg-ink" aria-label="MusicGuard narrated executive walkthrough" />
          )}
          <a href="https://notebooklm.link.google/PYLJI66rOOxj" target="_blank" rel="noopener noreferrer"
            className={`${PRIMARY_BUTTON} inline-flex items-center justify-center text-center`}>
            Open 1:20 Narrated Walkthrough in NotebookLM ↗
          </a>
        </div>
      )}
    </section>
  );
}

function AudioHashDropzone({ loading, info, error, dragActive, onDragActive, onFile }) {
  return (
    <div data-testid="audio-dropzone" aria-busy={loading}
      onDragOver={(event) => { event.preventDefault(); onDragActive(true); }}
      onDragLeave={() => onDragActive(false)}
      onDrop={(event) => { event.preventDefault(); onDragActive(false); return onFile(event.dataTransfer.files?.[0]); }}
      className={`space-y-3 rounded border-2 border-dashed p-4 ${dragActive ? "border-signal bg-signal/5" : "border-ink/20 bg-paper/50"}`}>
      <label htmlFor="provenance-audio-file" className="block font-display text-sm font-medium text-ink">Drop audio here or choose a local file</label>
      <input id="provenance-audio-file" type="file" accept={AUDIO_ACCEPT}
        className="focus-ring block w-full text-sm text-ink/70"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; return onFile(file); }} />
      {loading && <p role="status" className="text-xs text-ink/60">Hashing audio locally in browser… No audio is uploaded.</p>}
      {info && <p role="status" className="break-all text-xs leading-relaxed text-ink/65">{info.name} · {info.size} bytes<br />Hashed locally in browser — zero audio uploaded</p>}
      {error && <p role="alert" className="text-xs leading-relaxed text-risk-high">{error}</p>}
      <p className="text-xs leading-relaxed text-ink/50">File bytes never leave this browser. Only the SHA-256 fingerprint is added to the verification payload when you generate a preview.</p>
    </div>
  );
}

function RoyaltySliders({ splits, onChange }) {
  const conserved = splits.valid && splits.total === 10000;
  const percent = Number((splits.total / 100).toFixed(2));
  return (
    <fieldset className="space-y-4 rounded border border-ink/10 p-4">
      <legend className="px-1 font-display text-sm font-medium text-ink">10,000 bps royalty split studio</legend>
      {ROYALTY_ROLES.map((role, index) => (
        <div key={role} className="space-y-1">
          <label htmlFor={`provenance-split-${role.toLowerCase()}`} className="flex justify-between gap-3 font-display text-xs text-ink"><span>{role}</span><span>{splits.values[index]} bps</span></label>
          <input id={`provenance-split-${role.toLowerCase()}`} type="range" min={0} max={10000} step={50} value={splits.values[index]} onChange={(event) => onChange(index, event.target.value)} className="focus-ring w-full accent-signal" />
        </div>
      ))}
      <div role="status" aria-live="polite" className={`space-y-2 rounded border p-3 text-xs ${conserved ? "border-risk-low/30 bg-risk-low/10 text-risk-low" : "border-amber-500/30 bg-amber-50 text-amber-800"}`}>
        <p className="font-display font-semibold">Total: {splits.total} / 10,000 bps ({percent}%)</p>
        <div role="progressbar" aria-label="Royalty basis-point conservation" aria-valuemin={0} aria-valuemax={10000} aria-valuenow={Math.max(0, Math.min(10000, splits.total))} aria-valuetext={`${splits.total} of 10000 basis points`} className="h-2 overflow-hidden rounded bg-ink/10">
          <div className={`h-full rounded transition-all ${conserved ? "bg-risk-low" : "bg-amber-500"}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
        <p>{conserved ? "PASS: Exact 10,000 bps conserved" : `HOLD: SPLIT_CONSERVATION_VIOLATION — off by ${Math.abs(10000 - splits.total)} bps`}</p>
        {splits.notice && <p>{splits.notice}</p>}
      </div>
      <p className="text-xs leading-relaxed text-ink/50">Sliders change one role at a time; no automatic rebalancing. This local conservation indicator does not verify rights or replace the backend receipt.</p>
    </fieldset>
  );
}

function GateFindings({ receipt }) {
  const hold = receipt.gate === "HOLD";
  return (
    <div className="space-y-4">
      <div role="status" className={`inline-flex rounded-full border px-3 py-1 font-display text-xs font-semibold ${hold ? "border-risk-high/30 bg-risk-high/5 text-risk-high" : "border-risk-low/30 bg-risk-low/10 text-risk-low"}`}>GATE: {receipt.gate}</div>
      <p className="text-sm leading-relaxed text-ink/70">{hold ? "HOLD — stop and review the findings before any downstream action. This receipt does not execute or approve the proposed action." : "PASS — the proposal passed only the configured rules. This is not legal authorization, human approval, or permission to execute the proposed action."}</p>
      {receipt.findings.length ? <ul className="space-y-3 border-t border-ink/10 pt-4">{receipt.findings.map((finding) => <li key={finding.code} className="space-y-1"><p className="break-all font-mono text-xs font-semibold text-ink">{finding.code}</p><p className="text-sm leading-relaxed text-ink/65">{finding.reason}</p></li>)}</ul> : <p className="border-t border-ink/10 pt-4 text-sm text-ink/55">No findings returned for the configured rules.</p>}
    </div>
  );
}

function ReceiptField({ label, value }) {
  return <div><dt className="font-display text-xs uppercase tracking-wide text-ink/45">{label}</dt><dd className="mt-1 break-all font-mono text-xs leading-relaxed text-ink">{value}</dd></div>;
}

function ErrorNotice({ error }) {
  if (!error) return null;
  return <div role="alert" className="rounded border border-risk-high/30 bg-risk-high/5 p-4 text-sm text-risk-high">{typeof error.message === "string" ? error.message : "Unable to complete ProvenanceCheck. Please retry."}</div>;
}
