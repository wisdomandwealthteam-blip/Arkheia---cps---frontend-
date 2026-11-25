// src/pages/GovernanceCheckPage.jsx
// Three-step policy verification: local redaction, POST preview, GET receipt.
import { useEffect, useRef, useState } from "react";
import FormField from "../components/FormField";
import { api } from "../utils/apiClient";
import { maskAccountNumber } from "../utils/redaction";
import {
  ARCHITECTURE_VERSION,
  DECISION_DOMAINS,
  buildGovernancePayload,
  createRequestGuard,
  governanceSample,
  initialGovernanceForm,
  validateGovernanceReceipt,
} from "../utils/governance";

const STEPS = [
  { n: 1, label: "Input + redaction" },
  { n: 2, label: "Redacted preview" },
  { n: 3, label: "Full receipt" },
];
const SECONDARY_BUTTON = "focus-ring rounded border border-ink/20 px-5 py-2.5 font-display text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50";
const PRIMARY_BUTTON = "focus-ring rounded bg-signal px-5 py-2.5 font-display text-sm font-medium text-white transition hover:bg-signal/90 disabled:opacity-50";

export default function GovernanceCheckPage({ apiKey }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialGovernanceForm);
  const [submitted, setSubmitted] = useState(null);
  const [preview, setPreview] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
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
    setReceiptLoading(false);
  }

  const setField = (field) => (value) => {
    invalidateResults();
    setForm((current) => ({ ...current, [field]: Number.isNaN(value) ? "" : value }));
  };

  function loadSample(compliant) {
    invalidateResults();
    setForm(governanceSample(compliant));
  }

  async function handlePreviewSubmit(event) {
    event.preventDefault();
    invalidateResults();
    const token = requestGuard.current.invalidate();
    setPreviewLoading(true);
    try {
      const payload = buildGovernancePayload(form);
      const result = validateGovernanceReceipt(await api.governanceCheck(payload, apiKey));
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

  async function fetchReceipt() {
    if (!preview) return;
    const token = requestGuard.current.invalidate();
    setStep(3);
    setReceipt(null);
    setError(null);
    setReceiptLoading(true);
    try {
      const result = validateGovernanceReceipt(
        await api.governanceReceipt(preview.receipt_id, apiKey), preview.receipt_id
      );
      if (!requestGuard.current.isCurrent(token)) return;
      // A stored receipt must agree with the preview, not silently change the gate.
      if (JSON.stringify(result) !== JSON.stringify(preview)) {
        throw new Error("The retrieved receipt does not match the verified preview. Stop and retry the check.");
      }
      setReceipt(result);
    } catch (err) {
      if (requestGuard.current.isCurrent(token)) setError(err);
    } finally {
      if (requestGuard.current.isCurrent(token)) setReceiptLoading(false);
    }
  }

  function backToPreview() {
    requestGuard.current.invalidate();
    setReceipt(null);
    setReceiptLoading(false);
    setError(null);
    setStep(2);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="font-display text-xs uppercase tracking-[0.2em] text-signal">GOVERNANCECHECK™ · ENTERPRISE AI POLICY GATE</p>
        <h1 className="font-display text-3xl font-semibold text-ink">Verify AI outputs before action.</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink/60">
          Evaluate an operational model output against your configured guardrails. Review the redacted gate preview, then retrieve its full SHA-256 audit receipt. This check does not execute an action.
        </p>
      </header>

      <ol aria-label="GovernanceCheck steps" className="flex flex-wrap items-center gap-2">
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
                <button type="button" onClick={() => loadSample(false)} className={`${SECONDARY_BUTTON} border-risk-high/30 text-risk-high`}>Load Defective AI Output (Triggers HOLD)</button>
                <button type="button" onClick={() => loadSample(true)} className={`${SECONDARY_BUTTON} border-risk-low/30 text-risk-low`}>Load Compliant AI Output (Triggers PASS)</button>
              </div>
              <p className="text-xs leading-relaxed text-ink/50">Synthetic examples only. Loading an example prefills editable inputs; nothing is sent until you generate a preview.</p>
            </section>

            <section aria-labelledby="governance-input-heading" className="space-y-4 rounded border border-ink/10 bg-white p-6">
              <h2 id="governance-input-heading" className="font-display text-lg font-semibold text-ink">AI model output</h2>
              <FormField id="governance-model" label="Model ID (operational code)" type="text" value={form.model_id} onChange={setField("model_id")} required={false} hint="Not a name or other PII. Leave blank to evaluate the missing-model rule." />
              <div className="flex flex-col gap-1">
                <label htmlFor="governance-domain" className="font-display text-sm font-medium text-ink">Decision domain</label>
                <input id="governance-domain" type="text" list="governance-domain-options" required value={form.decision_domain} onChange={(event) => setField("decision_domain")(event.target.value)} className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink" />
                <datalist id="governance-domain-options">{DECISION_DOMAINS.map((domain) => <option key={domain} value={domain} />)}</datalist>
                <p className="text-xs text-ink/45">Choose a suggestion or enter your operational domain; do not enter personal data.</p>
              </div>
              <FormField id="governance-action" label="Action (operational code)" type="text" value={form.action} onChange={setField("action")} hint="For example APPROVE. This is a proposed code, not an instruction to execute; never enter PII." />
              <FormField id="governance-confidence" label="Confidence score" min={0} max={1} step="any" value={form.confidence_score} onChange={setField("confidence_score")} hint="A finite number from 0 to 1." />
              <label htmlFor="governance-override" className="flex items-start gap-3 rounded border border-ink/10 p-3 font-display text-sm text-ink">
                <input id="governance-override" type="checkbox" checked={form.human_override_required} onChange={(event) => setField("human_override_required")(event.target.checked)} className="focus-ring mt-0.5 accent-signal" />
                <span>Human override required<span className="mt-1 block text-xs font-normal text-ink/50">Evaluate the declared review requirement; no human approval is collected or implied here.</span></span>
              </label>
            </section>

            <section aria-labelledby="governance-policy-heading" className="space-y-4 rounded border border-ink/10 bg-white p-6">
              <h2 id="governance-policy-heading" className="font-display text-lg font-semibold text-ink">Configured policy & context</h2>
              <FormField id="governance-min-confidence" label="Minimum confidence" min={0} max={1} step="any" value={form.min_confidence} onChange={setField("min_confidence")} />
              <FormField id="governance-max-amount" label="Maximum unsupervised amount" min={0} step="any" value={form.max_unsupervised_amount} onChange={setField("max_unsupervised_amount")} />
              <FormField id="governance-amount" label="Proposed amount" min={0} step="any" value={form.amount} onChange={setField("amount")} />
              <div className="flex flex-col gap-1">
                <label htmlFor="governance-subject" className="font-display text-sm font-medium text-ink">Subject reference (masked locally)</label>
                <input id="governance-subject" type="password" autoComplete="off" spellCheck={false} maxLength={64} required value={form.subject_reference} onChange={(event) => setField("subject_reference")(event.target.value)} aria-describedby="governance-subject-hint" className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink" />
                <p id="governance-subject-hint" className="break-all text-xs text-ink/45">Masked reference: {maskAccountNumber(form.subject_reference) || "—"}. Use a synthetic or internal reference only.</p>
              </div>
            </section>
            <ErrorNotice error={error} />
            <button type="submit" disabled={previewLoading} className={`${PRIMARY_BUTTON} w-full`}>
              {previewLoading ? "Generating preview..." : "Generate redacted preview →"}
            </button>
            {previewLoading && <p role="status" className="text-xs text-ink/55">Evaluating configured rules. Editing inputs or loading a preset discards this pending result.</p>}
          </div>
          <LocalRedaction form={form} />
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
            <button type="button" onClick={fetchReceipt} className={PRIMARY_BUTTON}>View full receipt →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <section aria-busy={receiptLoading} className="space-y-5 rounded border border-ink/10 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Full audit receipt</h2>
            {receiptLoading && <p role="status" className="text-sm text-ink/60">Retrieving the stored receipt...</p>}
            <ErrorNotice error={error} />
            {error && !receiptLoading && <button type="button" onClick={fetchReceipt} className={SECONDARY_BUTTON}>Retry receipt retrieval</button>}
            {receipt && !receiptLoading && (
              <>
                <GateFindings receipt={receipt} />
                <dl className="space-y-4 border-t border-ink/10 pt-5">
                  <ReceiptField label="Receipt ID" value={receipt.receipt_id} />
                  <ReceiptField label="SHA-256 digest" value={receipt.sha256_digest} />
                  <ReceiptField label="Architecture version" value={receipt.architecture_version} />
                  <ReceiptField label="Evaluated at (UTC)" value={receipt.evaluated_at} />
                </dl>
                <button type="button" onClick={() => downloadReceipt(receipt)} className={SECONDARY_BUTTON}>Download JSON receipt</button>
              </>
            )}
          </section>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={backToPreview} className={SECONDARY_BUTTON}>← Back to preview</button>
            <button type="button" onClick={() => { invalidateResults(); setForm(initialGovernanceForm()); }} className={SECONDARY_BUTTON}>Start a new check</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LocalRedaction({ form }) {
  return (
    <aside className="h-fit rounded border border-ink/10 bg-ink p-5 font-display text-paper lg:sticky lg:top-6">
      <h2 className="text-xs uppercase tracking-wide text-paper/60">Local redaction — what gets transmitted</h2>
      <dl className="mt-4 space-y-3 text-xs">
        <div><dt className="text-paper/50">Subject reference</dt><dd className="mt-1 break-all font-mono text-paper/90">{maskAccountNumber(form.subject_reference) || "—"}</dd></div>
        <div><dt className="text-paper/50">Operational fields</dt><dd className="mt-1 leading-relaxed text-paper/80">Model ID, domain, action, confidence, human override requirement, policy limits, and amount.</dd></div>
      </dl>
      <p className="mt-5 border-t border-paper/15 pt-4 text-xs leading-relaxed text-paper/70">
        PII notice: do not enter names, emails, SSNs, or other personal data. Model IDs and actions are operational codes, not PII. The subject reference is masked in your browser before any preview or transmission. Raw references never leave this device and inputs are not saved to browser storage.
      </p>
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
        : "PASS — the output passed only the configured rules. This is not legal authorization, human approval, or permission to execute the proposed action."}</p>
      {receipt.findings.length ? (
        <ul className="space-y-3 border-t border-ink/10 pt-4">
          {receipt.findings.map((finding, index) => (
            <li key={`${finding.code}-${index}`} className="space-y-1">
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

function ErrorNotice({ error }) {
  if (!error) return null;
  const message = typeof error.message === "string" ? error.message : "Unable to complete GovernanceCheck. Please retry.";
  return <div role="alert" className="rounded border border-risk-high/30 bg-risk-high/5 p-4 text-sm text-risk-high">{message}</div>;
}

function downloadReceipt(receipt) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(receipt, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${receipt.receipt_id}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
