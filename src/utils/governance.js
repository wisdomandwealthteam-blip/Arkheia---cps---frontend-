// src/utils/governance.js
import { maskAccountNumber } from "./redaction.js";

export const ARCHITECTURE_VERSION = "PLATFORM-ARCHITECTURE-2026-V1";
export const DECISION_DOMAINS = ["underwriting", "credit_limit", "claims", "agent_action"];

// Static backend rules, in their required receipt order.
const FINDING_REASONS = {
  LOW_MODEL_CONFIDENCE: "Model confidence is below the policy minimum.",
  UNSUPERVISED_HIGH_VALUE_ACTION: "Transaction amount exceeds the unsupervised policy maximum without required human override.",
  MISSING_MODEL_PROVENANCE: "Model provenance is missing or unknown.",
};
const FINDING_CODES = Object.keys(FINDING_REASONS);

export function initialGovernanceForm() {
  return {
    model_id: "",
    decision_domain: "underwriting",
    action: "APPROVE",
    confidence_score: "",
    human_override_required: false,
    min_confidence: 0.85,
    max_unsupervised_amount: 10000,
    amount: "",
    subject_reference: "",
  };
}

// Synthetic presets populate the form only; they do not perform verification.
export function governanceSample(compliant) {
  return {
    model_id: "underwriting-v1",
    decision_domain: "underwriting",
    action: "APPROVE",
    confidence_score: compliant ? 0.96 : 0.68,
    human_override_required: compliant,
    min_confidence: 0.85,
    max_unsupervised_amount: 10000,
    amount: compliant ? 5000 : 45000,
    subject_reference: "SAMPLE-0001",
  };
}

function finiteNumber(value, label, min, max = Infinity) {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) {
    throw new Error(`${label} is required and must be a finite number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(max === Infinity
      ? `${label} must be a finite, non-negative number.`
      : `${label} must be a finite number between ${min} and ${max}.`);
  }
  return number;
}

function operationalCode(value, label, allowBlank = false) {
  if (typeof value !== "string") throw new Error(`${label} must be an operational code, not personal data.`);
  const code = value.trim();
  if (allowBlank && !code) return "";
  const digitsOnly = code.replace(/[._:-]/g, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(code) || /^\d{9}$/.test(digitsOnly)) {
    throw new Error(`${label} must be an operational code using letters, numbers, dots, underscores, colons, or hyphens; do not enter PII.`);
  }
  return code;
}

export function buildGovernancePayload(form) {
  if (typeof form.human_override_required !== "boolean") {
    throw new Error("Human override required must be true or false.");
  }
  if (typeof form.decision_domain !== "string" || !form.decision_domain.trim()) {
    throw new Error("Decision domain is required.");
  }
  if (typeof form.subject_reference !== "string" || !form.subject_reference.trim()) {
    throw new Error("Subject reference is required. Use a synthetic or internal reference only.");
  }
  // Allowlist fields: raw subject references, names, emails, and SSNs are never sent.
  return {
    model_id: operationalCode(form.model_id, "Model ID", true),
    decision_domain: operationalCode(form.decision_domain, "Decision domain"),
    proposed_action: operationalCode(form.action, "Action"),
    confidence_score: finiteNumber(form.confidence_score, "Confidence score", 0, 1),
    human_override_required: form.human_override_required,
    policy_thresholds: {
      min_confidence: finiteNumber(form.min_confidence, "Minimum confidence", 0, 1),
      max_unsupervised_amount: finiteNumber(form.max_unsupervised_amount, "Maximum unsupervised amount", 0),
    },
    transaction_amount: finiteNumber(form.amount, "Amount", 0),
    redacted_subject_ref: maskAccountNumber(form.subject_reference),
  };
}

export function validateGovernanceReceipt(receipt, expectedId) {
  const utcTime = typeof receipt?.evaluated_at === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(receipt.evaluated_at) &&
    Number.isFinite(Date.parse(receipt.evaluated_at));
  const validFindings = Array.isArray(receipt?.findings) && receipt.findings.length <= 3 &&
    receipt.findings.every((finding, index, findings) =>
      finding && FINDING_CODES.includes(finding.code) &&
      finding.reason === FINDING_REASONS[finding.code] &&
      (index === 0 || FINDING_CODES.indexOf(findings[index - 1].code) < FINDING_CODES.indexOf(finding.code)));
  if (!receipt || typeof receipt.receipt_id !== "string" || !/^gov_[a-f0-9]{64}$/.test(receipt.receipt_id) ||
      receipt.receipt_id !== `gov_${receipt.sha256_digest}` ||
      (expectedId && receipt.receipt_id !== expectedId) ||
      !["PASS", "HOLD"].includes(receipt.gate) ||
      receipt.architecture_version !== ARCHITECTURE_VERSION ||
      typeof receipt.sha256_digest !== "string" || !/^[a-f0-9]{64}$/.test(receipt.sha256_digest) || !utcTime ||
      !validFindings || receipt.gate !== (receipt.findings.length ? "HOLD" : "PASS")) {
    throw new Error("The backend returned an invalid GovernanceCheck receipt. No gate decision is available; retry the check.");
  }
  // Retain only receipt fields, never arbitrary echoed request data.
  return {
    receipt_id: receipt.receipt_id,
    gate: receipt.gate,
    architecture_version: receipt.architecture_version,
    sha256_digest: receipt.sha256_digest,
    findings: receipt.findings.map(({ code, reason }) => ({ code, reason })),
    evaluated_at: receipt.evaluated_at,
  };
}

// A monotonically increasing token invalidates pending POST/GET responses after edits.
export function createRequestGuard() {
  let revision = 0;
  return {
    invalidate: () => ++revision,
    isCurrent: (token) => token === revision,
  };
}
