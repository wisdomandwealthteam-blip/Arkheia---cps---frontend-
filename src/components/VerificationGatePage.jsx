// Shared additive gate layout. GovernanceCheckPage remains byte-for-byte unchanged.
import { useEffect, useRef, useState } from "react";
import FormField from "./FormField";
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
const SECONDARY_BUTTON = "focus-ring rounded border border-ink/20 px-5 py-2.5 font-display text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50";
const PRIMARY_BUTTON = "focus-ring rounded bg-signal px-5 py-2.5 font-display text-sm font-medium text-white transition hover:bg-signal/90 disabled:opacity-50";

export default function VerificationGatePage({ gate, apiKey }) {
  const config = gateConfig(gate);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => initialGateForm(gate));
  const [submitted, setSubmitted] = useState(null);
  const [preview, setPreview] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const requestGuard = useRef(createRequestGuard());

  useEffect(() => {
    const guard = requestGuard.current;
    return () => guard.invalidate();
  }, []);

  function invalidateResults() {
    requestGuard.current.invalidate();
    setStep(1);
    setSubmitted(null);
    setPreview(null);
    setReceipt(null);
    setError(null);
    setPreviewLoading(false);
  }

  const setField = (field) => (value) => {
    invalidateResults();
    setForm((current) => ({ ...current, [field]: Number.isNaN(value) ? "" : value }));
  };

  function loadSample(compliant) {
    invalidateResults();
    setForm(gateSample(gate, compliant));
  }

  async function handlePreviewSubmit(event) {
    event.preventDefault();
    invalidateResults();
    const token = requestGuard.current.invalidate();
    setPreviewLoading(true);
    try {
      const payload = buildGatePayload(gate, form);
      const result = validateGateReceipt(gate, await api[config.method](payload, apiKey));
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
    // These endpoints return the full receipt in POST. Do not invent a GET or re-check.
    setReceipt(validateGateReceipt(gate, preview));
    setError(null);
    setStep(3);
  }

  function backToPreview() {
    requestGuard.current.invalidate();
    setReceipt(null);
    setError(null);
    setStep(2);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="font-display text-xs uppercase tracking-[0.2em] text-signal">{config.brand}</p>
        <h1 className="font-display text-3xl font-semibold text-ink">{config.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink/60">{config.description} Review the redacted gate preview, then view its full SHA-256 audit receipt.</p>
      </header>

      <ol aria-label={`${config.name} steps`} className="flex flex-wrap items-center gap-2">
        {STEPS.map((item, index) => (
          <li key={item.n} className="flex items-center gap-2">
            <button type="button" aria-current={step === item.n ? "step" : undefined}
              disabled={item.n >= step}
              onClick={() => item.n === 1 ? invalidateResults() : backToPreview()}
              className={`focus-ring flex items-center gap-2 rounded px-2 py-1 font-display text-xs ${item.n === step ? "text-ink" : item.n < step ? "text-ink/50 hover:text-ink" : "cursor-default text-ink/30"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${item.n === step ? "border-signal bg-signal text-white" : "border-ink/15 text-ink/40"}`}>{item.n}</span>
              {item.label}
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
                <button type="button" onClick={() => loadSample(false)} className={`${SECONDARY_BUTTON} border-risk-high/30 text-risk-high`}>Load Defective {config.sampleName} (Triggers HOLD)</button>
                <button type="button" onClick={() => loadSample(true)} className={`${SECONDARY_BUTTON} border-risk-low/30 text-risk-low`}>Load Compliant {config.sampleName} (Triggers PASS)</button>
              </div>
              <p className="text-xs leading-relaxed text-ink/50">Synthetic examples only. Loading an example prefills editable inputs; nothing is sent until you generate a preview.</p>
            </section>

            <section aria-labelledby={`${gate}-input-heading`} className="space-y-4 rounded border border-ink/10 bg-white p-6">
              <h2 id={`${gate}-input-heading`} className="font-display text-lg font-semibold text-ink">{config.inputHeading}</h2>
              {config.fields.map((field) => field.type === "boolean" ? (
                <label key={field.key} htmlFor={`${gate}-${field.key}`} className="flex items-start gap-3 rounded border border-ink/10 p-3 font-display text-sm text-ink">
                  <input id={`${gate}-${field.key}`} type="checkbox" checked={form[field.key]} onChange={(event) => setField(field.key)(event.target.checked)} className="focus-ring mt-0.5 accent-signal" />
                  <span>{field.label}<span className="mt-1 block text-xs font-normal text-ink/50">{field.hint}</span></span>
                </label>
              ) : (
                <FormField key={field.key} id={`${gate}-${field.key}`} label={field.label}
                  type={["code", "splits"].includes(field.type) ? "text" : "number"}
                  step={field.type === "integer" ? 1 : "any"} value={form[field.key]}
                  onChange={setField(field.key)} required={false} hint={field.hint} />
              ))}
            </section>

            <section aria-labelledby={`${gate}-context-heading`} className="space-y-4 rounded border border-ink/10 bg-white p-6">
              <h2 id={`${gate}-context-heading`} className="font-display text-lg font-semibold text-ink">Configured policy & context</h2>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${gate}-subject`} className="font-display text-sm font-medium text-ink">Subject reference (masked locally)</label>
                <input id={`${gate}-subject`} type="password" autoComplete="off" spellCheck={false} maxLength={64} value={form.subject_reference} onChange={(event) => setField("subject_reference")(event.target.value)} aria-describedby={`${gate}-subject-hint`} className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink" />
                <p id={`${gate}-subject-hint`} className="break-all text-xs text-ink/45">Masked reference: {maskAccountNumber(form.subject_reference) || "—"}. Optional; use a synthetic or internal reference only.</p>
              </div>
            </section>
            <ErrorNotice error={error} name={config.name} />
            <button type="submit" disabled={previewLoading} className={`${PRIMARY_BUTTON} w-full`}>
              {previewLoading ? "Generating preview..." : "Generate redacted preview →"}
            </button>
            {previewLoading && <p role="status" className="text-xs text-ink/55">Evaluating configured rules. Editing inputs or loading a preset discards this pending result.</p>}
          </div>
          <LocalRedaction form={form} config={config} />
        </form>
      )}

      {step === 2 && preview && (
        <div className="space-y-6">
          <section className="space-y-5 rounded border border-ink/10 bg-white p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Redacted preview</h2>
              <p className="mt-1 break-all font-mono text-[11px] text-ink/45">{preview.receipt_id}</p>
            </div>
            <GateFindings receipt={preview} />
            <div className="border-t border-ink/10 pt-4">
              <h3 className="font-display text-xs uppercase tracking-wide text-ink/50">Redacted input submitted</h3>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded bg-paper p-4 text-xs leading-relaxed text-ink/75">{JSON.stringify(submitted, null, 2)}</pre>
            </div>
          </section>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={invalidateResults} className={SECONDARY_BUTTON}>← Edit inputs</button>
            <button type="button" onClick={viewReceipt} className={PRIMARY_BUTTON}>View full receipt →</button>
          </div>
        </div>
      )}

      {step === 3 && receipt && (
        <div className="space-y-6">
          <section className="space-y-5 rounded border border-ink/10 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Full audit receipt</h2>
            <GateFindings receipt={receipt} />
            <dl className="space-y-4 border-t border-ink/10 pt-5">
              <ReceiptField label="Receipt ID" value={receipt.receipt_id} />
              <ReceiptField label="SHA-256 digest" value={receipt.sha256} />
              <ReceiptField label="Architecture version" value={receipt.architecture_version} />
              <ReceiptField label="Evaluated at (UTC)" value={receipt.timestamp} />
            </dl>
            <button type="button" onClick={() => downloadReceipt(receipt)} className={SECONDARY_BUTTON}>Download JSON receipt</button>
          </section>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={backToPreview} className={SECONDARY_BUTTON}>← Back to preview</button>
            <button type="button" onClick={() => { invalidateResults(); setForm(initialGateForm(gate)); }} className={SECONDARY_BUTTON}>Start a new check</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LocalRedaction({ form, config }) {
  return (
    <aside className="h-fit rounded border border-ink/10 bg-ink p-5 font-display text-paper lg:sticky lg:top-6">
      <h2 className="text-xs uppercase tracking-wide text-paper/60">Local redaction — what gets transmitted</h2>
      <dl className="mt-4 space-y-3 text-xs">
        <div><dt className="text-paper/50">Subject reference</dt><dd className="mt-1 break-all font-mono text-paper/90">{maskAccountNumber(form.subject_reference) || "—"}</dd></div>
        <div><dt className="text-paper/50">Operational fields</dt><dd className="mt-1 leading-relaxed text-paper/80">{config.fields.map((field) => field.label).join(", ")}.</dd></div>
      </dl>
      <p className="mt-5 border-t border-paper/15 pt-4 text-xs leading-relaxed text-paper/70">PII notice: do not enter names, emails, SSNs, or other personal data. Identifiers and hashes are operational codes, not PII. The subject reference is masked in your browser before any preview or transmission. Raw references never leave this device and inputs are not saved to browser storage.</p>
      <p className="mt-4 text-[11px] leading-relaxed text-paper/55">Only verification occurs. HOLD means stop and review; PASS is limited to the configured rules, not legal authorization.</p>
      <p className="mt-4 break-all font-mono text-[10px] text-paper/40">{ARCHITECTURE_VERSION}</p>
    </aside>
  );
}

function GateFindings({ receipt }) {
  const hold = receipt.gate === "HOLD";
  return (
    <div className="space-y-4">
      <div role="status" className={`inline-flex rounded-full border px-3 py-1 font-display text-xs font-semibold ${hold ? "border-risk-high/30 bg-risk-high/5 text-risk-high" : "border-risk-low/30 bg-risk-low/10 text-risk-low"}`}>GATE: {receipt.gate}</div>
      <p className="text-sm leading-relaxed text-ink/70">{hold
        ? "HOLD — stop and review the findings before any downstream action. This receipt does not execute or approve the proposed action."
        : "PASS — the proposal passed only the configured rules. This is not legal authorization, human approval, or permission to execute the proposed action."}</p>
      {receipt.findings.length ? (
        <ul className="space-y-3 border-t border-ink/10 pt-4">
          {receipt.findings.map((finding) => (
            <li key={finding.code} className="space-y-1">
              <p className="break-all font-mono text-xs font-semibold text-ink">{finding.code}</p>
              <p className="text-sm leading-relaxed text-ink/65">{finding.reason}</p>
            </li>
          ))}
        </ul>
      ) : <p className="border-t border-ink/10 pt-4 text-sm text-ink/55">No findings returned for the configured rules.</p>}
    </div>
  );
}

function ReceiptField({ label, value }) {
  return <div><dt className="font-display text-xs uppercase tracking-wide text-ink/45">{label}</dt><dd className="mt-1 break-all font-mono text-xs leading-relaxed text-ink">{value}</dd></div>;
}

function ErrorNotice({ error, name }) {
  if (!error) return null;
  const message = typeof error.message === "string" ? error.message : `Unable to complete ${name}. Please retry.`;
  return <div role="alert" className="rounded border border-risk-high/30 bg-risk-high/5 p-4 text-sm text-risk-high">{message}</div>;
}

export function downloadReceipt(receipt) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(receipt, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${receipt.receipt_id}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
