// Verification-only contracts for the four remaining ARKHEIA DVE gates.
import { ARCHITECTURE_VERSION } from "./governance.js";
import { maskAccountNumber } from "./redaction.js";

export { ARCHITECTURE_VERSION };

export const GATE_FINDING_REASONS = {
  SPLIT_CONSERVATION_VIOLATION: "Integer basis-point splits must sum to 10000.",
  INVALID_GROSS_AMOUNT: "Gross amount must be a positive integer number of cents.",
  MISSING_PROVENANCE_HASH: "ISRC and audio fingerprint hash must both be present.",
  UNVERIFIED_RIGHTS_CHAIN: "Rights clearance must be explicitly verified.",
  INSUFFICIENT_QUORUM_SIGNATURES: "Collected signatures must meet the required quorum.",
  EXPIRED_OR_INACTIVE_CUSTODY_POLICY: "The custody policy window must be active.",
  CUSTODY_LIMIT_EXCEEDED: "Release amount must not exceed the custody limit.",
  UNATTESTED_EDGE_NODE: "The edge node must have a valid attestation.",
  SENSOR_INVARIANT_BREACH: "Telemetry must remain within the permitted bounds.",
  MISSING_LOCAL_AUDIT_HASH: "An offline queue audit hash must be present.",
};

export const VERIFICATION_GATES = {
  settlement: {
    name: "SettlementCheck", brand: "SETTLEMENTCHECK™ · BASIS-POINT CONSERVATION GATE",
    title: "Verify settlement splits before release.", sampleName: "Settlement",
    prefix: "stl", method: "settlementCheck", inputHeading: "Settlement proposal",
    description: "Check integer basis-point conservation and the gross amount. This verification does not settle funds or initiate a payment.",
    fields: [
      { key: "gross_amount_cents", label: "Gross amount (integer cents)", type: "integer", hint: "Use integer cents. Zero or a negative amount triggers HOLD." },
      { key: "splits_bps", label: "Splits (integer basis points)", type: "splits", hint: "Comma-separated integers, for example 6000, 4000. The sum must equal 10000." },
    ],
    codes: ["SPLIT_CONSERVATION_VIOLATION", "INVALID_GROSS_AMOUNT"],
  },
  provenance: {
    name: "ProvenanceCheck", brand: "PROVENANCECHECK™ / MUSICGUARD · RIGHTS & PROVENANCE GATE",
    title: "Verify music provenance before distribution.", sampleName: "Music Provenance",
    prefix: "prv", method: "provenanceCheck", inputHeading: "Recording provenance",
    description: "Check recording identifiers, the declared rights chain, and basis-point splits. This verification does not license music or establish legal ownership.",
    fields: [
      { key: "isrc", label: "ISRC (operational recording code)", type: "code", hint: "Leave blank to evaluate the missing-provenance rule. Do not enter a name or personal data." },
      { key: "audio_fingerprint_sha256", label: "Audio fingerprint SHA-256", type: "code", hint: "Enter the operational fingerprint hash, not audio or personal data. A blank value triggers HOLD." },
      { key: "rights_cleared", label: "Rights chain cleared", type: "boolean", hint: "A declared verification input only; no rights clearance is collected or implied here." },
      { key: "splits_bps", label: "Splits (integer basis points)", type: "splits", hint: "Comma-separated integers. The sum must equal 10000." },
    ],
    codes: ["MISSING_PROVENANCE_HASH", "UNVERIFIED_RIGHTS_CHAIN", "SPLIT_CONSERVATION_VIOLATION"],
  },
  custody: {
    name: "CustodyCheck", brand: "CUSTODYCHECK™ / CUSTOS · QUORUM & RELEASE POLICY GATE",
    title: "Verify custody policy before release.", sampleName: "Custody Release",
    prefix: "cst", method: "custodyCheck", inputHeading: "Custody release proposal",
    description: "Check the declared signature count, active policy window, and release limit. This verification does not collect signatures or release assets.",
    fields: [
      { key: "signatures_collected", label: "Signatures collected", type: "integer", hint: "Integer signature count; must meet the required quorum." },
      { key: "quorum_required", label: "Quorum required", type: "integer", hint: "Integer count required by the configured custody policy." },
      { key: "policy_window_active", label: "Custody policy window active", type: "boolean", hint: "An inactive or expired policy triggers HOLD." },
      { key: "release_amount", label: "Proposed release amount", type: "number", hint: "Use the same units as the custody limit." },
      { key: "custody_limit", label: "Custody limit", type: "number", hint: "Release amounts above this configured limit trigger HOLD." },
    ],
    codes: ["INSUFFICIENT_QUORUM_SIGNATURES", "EXPIRED_OR_INACTIVE_CUSTODY_POLICY", "CUSTODY_LIMIT_EXCEEDED"],
  },
  edge: {
    name: "EdgeVerify", brand: "EDGEVERIFY™ · NODE ATTESTATION & LOCAL AUDIT GATE",
    title: "Verify edge evidence before synchronization.", sampleName: "Edge Evidence",
    prefix: "edg", method: "edgeCheck", inputHeading: "Edge verification evidence",
    description: "Check declared node attestation, telemetry bounds, and the local queue audit hash. This verification does not attest hardware or execute queued actions.",
    fields: [
      { key: "node_attestation_valid", label: "Node attestation valid", type: "boolean", hint: "An unattested node triggers HOLD." },
      { key: "telemetry_within_bounds", label: "Telemetry within configured bounds", type: "boolean", hint: "A sensor invariant breach triggers HOLD." },
      { key: "offline_queue_hash", label: "Offline queue audit hash", type: "code", hint: "Use an operational hash only. Leave blank to evaluate missing local audit evidence." },
    ],
    codes: ["UNATTESTED_EDGE_NODE", "SENSOR_INVARIANT_BREACH", "MISSING_LOCAL_AUDIT_HASH"],
  },
};

export function gateConfig(gate) {
  if (!Object.hasOwn(VERIFICATION_GATES, gate)) throw new Error("Unknown verification gate.");
  return VERIFICATION_GATES[gate];
}

export function initialGateForm(gate) {
  return Object.fromEntries([
    ...gateConfig(gate).fields.map(({ key, type }) => [key, type === "boolean" ? false : ""]),
    ["subject_reference", ""],
  ]);
}

// Presets only populate editable state. Gate decisions always come from the backend.
export function gateSample(gate, compliant) {
  gateConfig(gate);
  const samples = {
    settlement: { gross_amount_cents: compliant ? 125000 : 0, splits_bps: compliant ? "6000, 4000" : "6000, 3000" },
    provenance: { isrc: compliant ? "USAAA2600001" : "", audio_fingerprint_sha256: compliant ? "a".repeat(64) : "", rights_cleared: compliant, splits_bps: compliant ? "7000, 3000" : "7000, 2000" },
    custody: { signatures_collected: compliant ? 3 : 1, quorum_required: 3, policy_window_active: compliant, release_amount: compliant ? 5000 : 15000, custody_limit: 10000 },
    edge: { node_attestation_valid: compliant, telemetry_within_bounds: compliant, offline_queue_hash: compliant ? "b".repeat(64) : "" },
  };
  return { ...samples[gate], subject_reference: "SAMPLE-0001" };
}

function numericValue(value, label, integer) {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) {
    throw new Error(`${label} must be a finite ${integer ? "integer" : "number"}.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) {
    throw new Error(`${label} must be a finite ${integer ? "safe integer" : "number"}.`);
  }
  return number;
}

function operationalValue(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be an operational code, not personal data.`);
  const code = value.trim();
  if (code && (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(code) || /^\d{9}$/.test(code.replace(/[._:-]/g, "")))) {
    throw new Error(`${label} must be an operational code; do not enter names, emails, or SSNs.`);
  }
  return code;
}

export function buildGatePayload(gate, form) {
  const payload = {};
  for (const field of gateConfig(gate).fields) {
    const value = form[field.key];
    if (field.type === "boolean") {
      if (typeof value !== "boolean") throw new Error(`${field.label} must be true or false.`);
      payload[field.key] = value;
    } else if (field.type === "splits") {
      if (typeof value !== "string") throw new Error("Splits must be comma-separated integer basis points.");
      // Empty splits reach the backend conservation rule rather than a valid default.
      payload[field.key] = value.trim() ? value.split(",").map((part) => numericValue(part, "Each split", true)) : [];
    } else if (field.type === "code") {
      payload[field.key] = operationalValue(value, field.label);
    } else {
      payload[field.key] = numericValue(value, field.label, field.type === "integer");
    }
  }
  if (typeof form.subject_reference !== "string") throw new Error("Subject reference must be text.");
  payload.redacted_subject_ref = maskAccountNumber(form.subject_reference);
  return payload;
}

export function validateGateReceipt(gate, receipt) {
  const config = gateConfig(gate);
  const validTime = typeof receipt?.timestamp === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(receipt.timestamp) &&
    Number.isFinite(Date.parse(receipt.timestamp));
  const validFindings = Array.isArray(receipt?.findings) && receipt.findings.length <= config.codes.length &&
    receipt.findings.every((finding, index, findings) => finding && config.codes.includes(finding.code) &&
      finding.reason === GATE_FINDING_REASONS[finding.code] &&
      (index === 0 || config.codes.indexOf(findings[index - 1].code) < config.codes.indexOf(finding.code)));
  if (!receipt || typeof receipt.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
      receipt.receipt_id !== `${config.prefix}_${receipt.sha256}` ||
      receipt.architecture_version !== ARCHITECTURE_VERSION || !validTime || !validFindings ||
      !["PASS", "HOLD"].includes(receipt.gate) || receipt.gate !== (receipt.findings.length ? "HOLD" : "PASS")) {
    throw new Error(`The backend returned an invalid ${config.name} receipt. No gate decision is available; retry the check.`);
  }
  // Discard arbitrary echoed request data and preserve the complete canonical receipt.
  return {
    receipt_id: receipt.receipt_id, gate: receipt.gate,
    architecture_version: receipt.architecture_version,
    findings: receipt.findings.map(({ code, reason }) => ({ code, reason })),
    sha256: receipt.sha256, timestamp: receipt.timestamp,
  };
}
