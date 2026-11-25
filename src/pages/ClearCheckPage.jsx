// src/pages/ClearCheckPage.jsx
// Three-step ClearCheck consumer flow:
//   1. Input + local redaction (account numbers masked in-browser before
//      display or submission — raw identifiers never leave the client)
//   2. Redacted preview via POST /api/clearcheck/preview
//   3. Locked/unlocked report via GET /api/clearcheck/report/{check_id},
//      with 402/403 handled as an explicit Locked state and a Stripe
//      checkout trigger via POST /api/clearcheck/checkout.
import { useCallback, useEffect, useState } from "react";
import FormField from "../components/FormField";
import ResultPanel from "../components/ResultPanel";
import JurisdictionMeta from "../components/JurisdictionMeta";
import { api } from "../utils/apiClient";
import { maskAccountNumber, maskEmail, maskSsnLast4 } from "../utils/redaction";

const ACCOUNT_STATUSES = [
  "open",
  "closed",
  "paid",
  "charged_off",
  "in_collection",
  "disputed",
];

const JURISDICTION_SUGGESTIONS = ["US", "US-CA", "US-NY", "US-TX", "US-FL"];

const STEPS = [
  { n: 1, label: "Input + redaction" },
  { n: 2, label: "Redacted preview" },
  { n: 3, label: "Full report" },
];

const emptyAccount = () => ({
  account_number: "",
  creditor_name: "",
  status: "open",
  date_opened: "",
  date_closed: "",
  date_of_last_activity: "",
  reported_balance: 0,
  reported_past_due: 0,
  credit_limit: "",
});

const initialForm = () => ({
  consumer_name: "",
  consumer_email: "",
  ssn_last4: "",
  jurisdiction: "US",
  report_date: new Date().toISOString().slice(0, 10),
});

export default function ClearCheckPage({ apiKey, initialCheckId, inputContext, trialSessionId }) {
  const [step, setStep] = useState(initialCheckId ? 3 : 1);
  const [form, setForm] = useState(initialForm);
  const [accounts, setAccounts] = useState([emptyAccount()]);

  // step 2 state
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // step 3 state
  const [checkId, setCheckId] = useState(initialCheckId || null);
  const [report, setReport] = useState(null);
  const [locked, setLocked] = useState(null); // { unlock_required, message }
  const [reportError, setReportError] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);

  const setField = (field) => (value) =>
    setForm((f) => ({ ...f, [field]: value }));

  const setAccount = (index, field, value) =>
    setAccounts((list) =>
      list.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );

  const fetchReport = useCallback(
    async (id) => {
      setReportLoading(true);
      setReport(null);
      setReportError(null);
      setLocked(null);
      try {
        let res;
        if (trialSessionId) {
          const response = await fetch(
            `https://arkheia-cps-10.onrender.com/api/clearcheck/report/${encodeURIComponent(id)}?session_id=${encodeURIComponent(trialSessionId)}`,
            { headers: { "X-API-Key": apiKey }, cache: "no-store" }
          );
          res = await response.json();
          if (!response.ok) {
            const error = new Error(typeof res.detail === "string" ? res.detail : "Unable to retrieve the report.");
            error.status = response.status;
            throw error;
          }
        } else {
          res = await api.clearCheckReport(id, apiKey);
        }
        setReport(res);
      } catch (err) {
        if (err.status === 402 || err.status === 403) {
          setLocked({ unlock_required: true, message: err.message });
        } else {
          setReportError(err);
        }
      } finally {
        setReportLoading(false);
      }
    },
    [apiKey, trialSessionId]
  );

  // Arriving back from Stripe (?check_id=...) jumps straight to step 3.
  useEffect(() => {
    if (initialCheckId) fetchReport(initialCheckId);
  }, [initialCheckId, fetchReport]);

  function buildPayload() {
    return {
      consumer_name: form.consumer_name.trim(),
      consumer_email: form.consumer_email.trim() || null,
      ssn_last4: form.ssn_last4.length === 4 ? form.ssn_last4 : null,
      jurisdiction: form.jurisdiction.trim() || "US",
      report_date: form.report_date,
      accounts: accounts.map((a) => ({
        // local redaction: only the masked account number is transmitted
        account_number: maskAccountNumber(a.account_number),
        creditor_name: a.creditor_name.trim(),
        status: a.status,
        date_opened: a.date_opened,
        date_closed: a.date_closed || null,
        date_of_last_activity: a.date_of_last_activity || null,
        reported_balance: Number(a.reported_balance) || 0,
        reported_past_due: Number(a.reported_past_due) || 0,
        credit_limit: a.credit_limit === "" ? null : Number(a.credit_limit) || 0,
      })),
    };
  }

  async function handlePreviewSubmit(e) {
    e.preventDefault();
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await api.clearCheckPreview(buildPayload(), apiKey);
      setPreview(res);
      setCheckId(res.check_id);
      setReport(null);
      setLocked(null);
      setStep(2);
    } catch (err) {
      setPreviewError(err);
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleViewReport() {
    setStep(3);
    fetchReport(checkId);
  }

  async function handleUnlock() {
    setUnlockLoading(true);
    setReportError(null);
    try {
      const { checkout_url } = await api.clearCheckCheckout(
        checkId,
        form.consumer_email.trim() || null,
        apiKey
      );
      window.location.href = checkout_url;
    } catch (err) {
      setReportError(err);
      setUnlockLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <Stepper current={step} onNavigate={(n) => n < step && setStep(n)} />

      {step === 1 && inputContext}

      {step === 1 && (
        <StepInput
          form={form}
          setField={setField}
          accounts={accounts}
          setAccount={setAccount}
          addAccount={() => setAccounts((l) => [...l, emptyAccount()])}
          removeAccount={(i) =>
            setAccounts((l) => l.filter((_, idx) => idx !== i))
          }
          onSubmit={handlePreviewSubmit}
          loading={previewLoading}
          error={previewError}
        />
      )}

      {step === 2 && preview && (
        <StepPreview
          preview={preview}
          form={form}
          onBack={() => setStep(1)}
          onViewReport={handleViewReport}
        />
      )}

      {step === 3 && (
        <StepReport
          apiKey={apiKey}
          checkId={checkId}
          report={report}
          locked={locked}
          error={reportError}
          loading={reportLoading}
          unlockLoading={unlockLoading}
          onUnlock={handleUnlock}
          onRefresh={() => checkId && fetchReport(checkId)}
          onRestart={() => {
            setStep(1);
            setPreview(null);
            setReport(null);
            setLocked(null);
            setReportError(null);
          }}
          hasPreview={Boolean(preview)}
          onBackToPreview={() => setStep(2)}
        />
      )}
    </div>
  );
}

/* ---------- stepper ---------- */

function Stepper({ current, onNavigate }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <button
            onClick={() => onNavigate(s.n)}
            disabled={s.n >= current}
            className={`focus-ring flex items-center gap-2 rounded px-2 py-1 font-display text-xs ${
              s.n === current
                ? "text-ink"
                : s.n < current
                ? "text-ink/50 hover:text-ink"
                : "cursor-default text-ink/30"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                s.n === current
                  ? "border-signal bg-signal text-white"
                  : s.n < current
                  ? "border-ink/30 text-ink/60"
                  : "border-ink/15 text-ink/30"
              }`}
            >
              {s.n}
            </span>
            {s.label}
          </button>
          {i < STEPS.length - 1 && (
            <span aria-hidden="true" className="text-ink/20">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ---------- step 1: input + local redaction ---------- */

function StepInput({
  form,
  setField,
  accounts,
  setAccount,
  addAccount,
  removeAccount,
  onSubmit,
  loading,
  error,
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="space-y-4 rounded border border-ink/10 bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-ink">
            Consumer details
          </h2>
          <FormField
            label="Full name"
            id="consumer_name"
            type="text"
            value={form.consumer_name}
            onChange={setField("consumer_name")}
          />
          <FormField
            label="Email (optional)"
            id="consumer_email"
            type="email"
            value={form.consumer_email}
            onChange={setField("consumer_email")}
            required={false}
            hint="Used for your unlock receipt — masked in the preview"
          />
          <FormField
            label="SSN last 4 (optional)"
            id="ssn_last4"
            type="text"
            value={form.ssn_last4}
            onChange={(v) => setField("ssn_last4")(v.replace(/\D/g, "").slice(0, 4))}
            required={false}
            hint="Only the last four digits — never the full SSN"
          />
          <div className="flex flex-col gap-1">
            <label
              htmlFor="jurisdiction"
              className="font-display text-sm font-medium text-ink"
            >
              Jurisdiction
            </label>
            <input
              id="jurisdiction"
              type="text"
              list="jurisdiction-options"
              value={form.jurisdiction}
              onChange={(e) => setField("jurisdiction")(e.target.value)}
              required
              className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
            />
            <datalist id="jurisdiction-options">
              {JURISDICTION_SUGGESTIONS.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>
            <p className="text-xs text-ink/45">e.g. US, US-CA, US-NY</p>
          </div>
          <FormField
            label="Report date"
            id="report_date"
            type="date"
            value={form.report_date}
            onChange={setField("report_date")}
          />
        </div>

        <div className="space-y-4 rounded border border-ink/10 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              Reported accounts
            </h2>
            <button
              type="button"
              onClick={addAccount}
              className="focus-ring rounded border border-ink/20 px-3 py-1.5 font-display text-xs font-medium text-ink transition hover:bg-ink/5"
            >
              + Add account
            </button>
          </div>
          {accounts.map((a, i) => (
            <AccountEditor
              key={i}
              index={i}
              account={a}
              onChange={setAccount}
              onRemove={accounts.length > 1 ? () => removeAccount(i) : null}
            />
          ))}
        </div>

        {error && (
          <div className="rounded border border-risk-high/30 bg-risk-high/5 p-4">
            <p className="text-sm text-risk-high">{error.message}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="focus-ring w-full rounded bg-signal py-2.5 font-display text-sm font-medium text-white transition hover:bg-signal/90 disabled:opacity-50"
        >
          {loading ? "Generating preview..." : "Generate redacted preview →"}
        </button>
      </div>

      <RedactionPreview form={form} accounts={accounts} />
    </form>
  );
}

function AccountEditor({ index, account, onChange, onRemove }) {
  const set = (field) => (e) => onChange(index, field, e.target.value);
  const setNum = (field) => (e) =>
    onChange(
      index,
      field,
      Number.isNaN(e.target.valueAsNumber) ? "" : e.target.valueAsNumber
    );

  return (
    <div className="rounded border border-ink/10 p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-xs uppercase tracking-wide text-ink/40">
          Account #{index + 1}
        </p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="focus-ring rounded px-2 py-0.5 font-display text-xs text-risk-high hover:bg-risk-high/5"
          >
            Remove
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Account number" hint={`masked locally as ${maskAccountNumber(account.account_number) || "—"}`}>
          <input
            type="text"
            value={account.account_number}
            onChange={set("account_number")}
            maxLength={64}
            required
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
        <Field label="Creditor name">
          <input
            type="text"
            value={account.creditor_name}
            onChange={set("creditor_name")}
            maxLength={128}
            required
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
        <Field label="Status">
          <select
            value={account.status}
            onChange={set("status")}
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          >
            {ACCOUNT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date opened">
          <input
            type="date"
            value={account.date_opened}
            onChange={set("date_opened")}
            required
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
        <Field label="Date closed (optional)">
          <input
            type="date"
            value={account.date_closed}
            onChange={set("date_closed")}
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
        <Field label="Last activity (optional)">
          <input
            type="date"
            value={account.date_of_last_activity}
            onChange={set("date_of_last_activity")}
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
        <Field label="Reported balance (USD)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={account.reported_balance}
            onChange={setNum("reported_balance")}
            required
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
        <Field label="Past due (USD)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={account.reported_past_due}
            onChange={setNum("reported_past_due")}
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
        <Field label="Credit limit (optional)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={account.credit_limit}
            onChange={setNum("credit_limit")}
            className="focus-ring rounded border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-display text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink/45">{hint}</p>}
    </div>
  );
}

function RedactionPreview({ form, accounts }) {
  return (
    <aside className="h-fit rounded border border-ink/10 bg-ink p-5 font-display text-paper lg:sticky lg:top-6">
      <p className="text-xs uppercase tracking-wide text-paper/50">
        Local redaction — what gets transmitted
      </p>
      <div className="mt-3 space-y-1.5 text-xs">
        <RedactRow label="name" value={form.consumer_name || "—"} />
        <RedactRow
          label="email"
          value={form.consumer_email ? maskEmail(form.consumer_email) : "—"}
        />
        <RedactRow
          label="ssn"
          value={form.ssn_last4 ? maskSsnLast4(form.ssn_last4) : "—"}
        />
        <RedactRow label="jurisdiction" value={form.jurisdiction || "—"} />
        {accounts.map((a, i) => (
          <RedactRow
            key={i}
            label={`account #${i + 1}`}
            value={maskAccountNumber(a.account_number) || "—"}
          />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-paper/40">
        Account numbers are masked in your browser before submission — the
        raw identifiers never leave this device.
      </p>
    </aside>
  );
}

function RedactRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-paper/50">{label}</span>
      <span className="truncate text-paper/90">{value}</span>
    </div>
  );
}

/* ---------- step 2: redacted preview ---------- */

function StepPreview({ preview, form, onBack, onViewReport }) {
  return (
    <div className="space-y-6">
      <div className="rounded border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-xs uppercase tracking-wide text-ink/50">
              Redacted preview
            </p>
            <p className="mt-0.5 break-all font-display text-[11px] text-ink/35">
              {preview.check_id}
            </p>
          </div>
          {preview.unlock_required && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-risk-moderate/30 bg-risk-moderate/10 px-3 py-1 font-display text-xs font-medium uppercase tracking-wide text-risk-moderate">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Full report locked
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-4 border-t border-ink/10 pt-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-ink/45">Consumer</p>
            <p className="font-display text-ink">{form.consumer_name}</p>
          </div>
          <div>
            <p className="text-ink/45">Email</p>
            <p className="font-display text-ink">
              {form.consumer_email ? maskEmail(form.consumer_email) : "—"}
            </p>
          </div>
          <div>
            <p className="text-ink/45">SSN</p>
            <p className="font-display text-ink">
              {form.ssn_last4 ? maskSsnLast4(form.ssn_last4) : "—"}
            </p>
          </div>
        </div>

        <p className="mt-5 font-display text-4xl font-semibold text-ink">
          {preview.findings_count}
          <span className="ml-2 text-lg font-normal text-ink/40">
            finding{preview.findings_count === 1 ? "" : "s"} detected
          </span>
        </p>

        {preview.redacted_summary.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-ink/10 pt-4">
            {preview.redacted_summary.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink/75">
                <span aria-hidden="true" className="text-ink/30">
                  •
                </span>
                <span className="font-display">{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-ink/10 pt-4 text-sm text-ink/55">
            No consistency issues detected across the submitted accounts.
          </p>
        )}
      </div>

      <JurisdictionMeta
        jurisdiction={preview.jurisdiction}
        metadata={preview.jurisdiction_metadata}
      />

      <p className="rounded border border-ink/10 bg-ink/[0.02] p-4 text-xs leading-relaxed text-ink/50">
        {preview.notice}
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onBack}
          className="focus-ring rounded border border-ink/20 px-5 py-2.5 font-display text-sm font-medium text-ink transition hover:bg-ink/5"
        >
          ← Edit inputs
        </button>
        <button
          onClick={onViewReport}
          className="focus-ring rounded bg-signal px-5 py-2.5 font-display text-sm font-medium text-white transition hover:bg-signal/90"
        >
          View full report →
        </button>
      </div>
    </div>
  );
}

/* ---------- step 3: locked / unlocked report ---------- */

function StepReport({
  apiKey,
  checkId,
  report,
  locked,
  error,
  loading,
  unlockLoading,
  onUnlock,
  onRefresh,
  onRestart,
  hasPreview,
  onBackToPreview,
}) {
  const findingsCount = report && (
    Array.isArray(report.findings) ? report.findings.length : report.findings_count
  );

  return (
    <div className="space-y-6">
      {report && !loading && !locked && Number.isInteger(findingsCount) && findingsCount >= 0 && (
        <div role="status" className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-risk-low/30 bg-risk-low/10 px-3 py-1 font-display text-xs font-medium text-risk-low">
            ● UNLOCKED
          </span>
          <span className={`rounded-full border px-3 py-1 font-display text-xs font-medium ${
            findingsCount > 0
              ? "border-risk-high/30 bg-risk-high/5 text-risk-high"
              : "border-risk-low/30 bg-risk-low/10 text-risk-low"
          }`}>
            {findingsCount > 0 ? "● GATE: HOLD — DISCREPANCY FLAGGED" : "● GATE: PASS — CLEAN FILE"}
          </span>
        </div>
      )}

      {locked && !loading ? (
        <div className="rounded border border-risk-moderate/30 bg-risk-moderate/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-sm font-semibold text-ink">
                Report locked
              </p>
              <p className="mt-0.5 break-all font-display text-[11px] text-ink/35">
                {checkId}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-risk-moderate/30 bg-risk-moderate/10 px-3 py-1 font-display text-xs font-medium uppercase tracking-wide text-risk-moderate">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              unlock_required
            </span>
          </div>
          <p className="mt-3 text-sm text-ink/70">{locked.message}</p>
          <p className="mt-1 text-xs text-ink/45">
            A one-time payment unlocks the full deterministic findings
            breakdown for this check.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={onUnlock}
              disabled={unlockLoading}
              className="focus-ring rounded bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition hover:bg-ink/85 disabled:opacity-50"
            >
              {unlockLoading ? "Redirecting to checkout..." : "Unlock full report"}
            </button>
            <button
              onClick={onRefresh}
              className="focus-ring rounded border border-ink/20 px-5 py-2.5 font-display text-sm font-medium text-ink transition hover:bg-ink/5"
            >
              I've paid — check again
            </button>
          </div>
        </div>
      ) : (
        <ResultPanel
          variant="clearcheck"
          result={report}
          error={error}
          loading={loading}
        />
      )}

      <ContinuousVerificationAccess apiKey={apiKey} />

      <div className="flex flex-wrap gap-3">
        {hasPreview && (
          <button
            onClick={onBackToPreview}
            className="focus-ring rounded border border-ink/20 px-4 py-2 font-display text-xs font-medium text-ink transition hover:bg-ink/5"
          >
            ← Back to preview
          </button>
        )}
        <button
          onClick={onRestart}
          className="focus-ring rounded border border-ink/20 px-4 py-2 font-display text-xs font-medium text-ink transition hover:bg-ink/5"
        >
          Start a new check
        </button>
      </div>
    </div>
  );
}

function ContinuousVerificationAccess({ apiKey }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function activateTrial() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("https://arkheia-cps-10.onrender.com/api/clearcheck/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ plan: "trial_7d" }),
      });
      const session = await response.json();
      if (!response.ok) {
        throw new Error(typeof session.detail === "string" ? session.detail : "Trial checkout is temporarily unavailable. Please try again.");
      }
      const checkoutUrl = session.url || session.checkout_url;
      if (!checkoutUrl || new URL(checkoutUrl).origin !== "https://checkout.stripe.com") {
        throw new Error("A valid Stripe checkout link was not returned. Please try again.");
      }
      window.location.assign(checkoutUrl);
    } catch (err) {
      setError(err.message || "Unable to start trial checkout. Please try again.");
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="continuous-verification-heading" className="space-y-4 rounded-lg border border-signal/30 bg-white p-6">
      <p className="font-display text-xs uppercase tracking-wide text-signal">
        CONTINUOUS VERIFICATION ACCESS · GUARDRAIL-PROTECTED
      </p>
      <h3 id="continuous-verification-heading" className="font-display text-xl font-semibold text-ink">
        Unlock 7-Day Full ClearCheck™ Gate & Monitoring Access for $1
      </h3>
      <p className="text-sm leading-relaxed text-ink/65">
        Turn this single check into continuous pre-submission gating, multi-record verification, and exportable SHA-256 audit receipts.
      </p>
      <div className="rounded border border-ink/10 bg-ink/[0.02] p-4">
        <h4 className="font-display text-sm font-semibold text-ink">Data Protection & Guardrails</h4>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-xs leading-relaxed text-ink/65">
          <li><strong className="text-ink">Client-Side Redaction First:</strong> Sensitive identifiers are masked in your browser prior to verification.</li>
          <li><strong className="text-ink">Deterministic Execution Only:</strong> Records are evaluated strictly against codified statutory rules—never fed into probabilistic LLMs or used to train AI models.</li>
          <li><strong className="text-ink">Zero Resale or Third-Party Sharing:</strong> Your data is never sold, rented, or brokered.</li>
          <li><strong className="text-ink">Cryptographic Receipt Isolation:</strong> Only your SHA-256 verification digest (<code>chk_...</code>) and compliance finding summary are persisted for your audit trail.</li>
        </ol>
      </div>
      {error && <p role="alert" className="text-sm text-risk-high">{error}</p>}
      <button type="button" onClick={activateTrial} disabled={loading} className="focus-ring w-full rounded bg-signal px-5 py-3 font-display text-sm font-medium text-white transition hover:bg-signal/90 disabled:opacity-50 sm:w-auto">
        {loading ? "Redirecting to checkout..." : "Activate 7-Day Access — $1 →"}
      </button>
      <p className="text-xs leading-relaxed text-ink/50">
        $1.00 due today for 7-day full access. Cancel anytime in one click from Billing before your trial ends.
      </p>
    </section>
  );
}
