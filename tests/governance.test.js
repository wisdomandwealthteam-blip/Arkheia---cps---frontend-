import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHITECTURE_VERSION,
  DECISION_DOMAINS,
  buildGovernancePayload,
  createRequestGuard,
  governanceSample,
  initialGovernanceForm,
  validateGovernanceReceipt,
} from "../src/utils/governance.js";
import { maskAccountNumber } from "../src/utils/redaction.js";

const payloadKeys = [
  "model_id", "decision_domain", "proposed_action", "confidence_score",
  "human_override_required", "policy_thresholds", "transaction_amount", "redacted_subject_ref",
];
const ruleFindings = [
  { code: "LOW_MODEL_CONFIDENCE", reason: "Model confidence is below the policy minimum." },
  { code: "UNSUPERVISED_HIGH_VALUE_ACTION", reason: "Transaction amount exceeds the unsupervised policy maximum without required human override." },
  { code: "MISSING_MODEL_PROVENANCE", reason: "Model provenance is missing or unknown." },
];
export const receiptFixture = (gate = "HOLD") => ({
  receipt_id: `gov_${"b".repeat(64)}`,
  gate,
  architecture_version: ARCHITECTURE_VERSION,
  sha256_digest: "b".repeat(64),
  findings: gate === "HOLD" ? ruleFindings.slice(0, 2) : [],
  evaluated_at: "2026-11-25T18:00:00.000Z",
});

test("defective and compliant samples retain all exact synthetic values", () => {
  const common = {
    model_id: "underwriting-v1", decision_domain: "underwriting", action: "APPROVE",
    min_confidence: 0.85, max_unsupervised_amount: 10000, subject_reference: "SAMPLE-0001",
  };
  assert.deepEqual(governanceSample(false), { ...common, confidence_score: 0.68, amount: 45000, human_override_required: false });
  assert.deepEqual(governanceSample(true), { ...common, confidence_score: 0.96, amount: 5000, human_override_required: true });
  assert.notEqual(governanceSample(true), governanceSample(true));
});

for (const compliant of [false, true]) {
  test(`${compliant ? "compliant" : "defective"} payload has the exact eight-key flat backend allowlist and sample values`, () => {
    const form = {
      ...governanceSample(compliant), consumer_name: "Sensitive Name", email: "private@example.test", ssn: "123-45-6789",
      model_output: { model_id: "unexpected" }, policy: { min_confidence: 0 }, context: { amount: 1 },
      proposed_action: "unexpected", transaction_amount: 1, redacted_subject_ref: "raw-reference",
      policy_thresholds: { min_confidence: 0, max_unsupervised_amount: 1, extra: "unexpected" },
    };
    const payload = buildGovernancePayload(form);
    assert.deepEqual(Object.keys(payload).sort(), [...payloadKeys].sort());
    assert.deepEqual(Object.keys(payload.policy_thresholds).sort(), ["max_unsupervised_amount", "min_confidence"]);
    assert.deepEqual(payload, {
      model_id: "underwriting-v1", decision_domain: "underwriting", proposed_action: "APPROVE",
      confidence_score: compliant ? 0.96 : 0.68, human_override_required: compliant,
      policy_thresholds: { min_confidence: 0.85, max_unsupervised_amount: 10000 },
      transaction_amount: compliant ? 5000 : 45000, redacted_subject_ref: "*******0001",
    });
    assert.equal(form.subject_reference, "SAMPLE-0001");
    for (const sensitive of ["SAMPLE-0001", "Sensitive", "private@", "123-45-6789", "raw-reference", "unexpected"]) {
      assert.equal(JSON.stringify(payload).includes(sensitive), false);
    }
  });
}

test("subject masking matches the existing mask utility, including short references", () => {
  for (const reference of ["1", "1234", " 1234 5678 ", "SAMPLE-0001", "long-internal-reference"]) {
    assert.equal(buildGovernancePayload({ ...governanceSample(true), subject_reference: reference }).redacted_subject_ref, maskAccountNumber(reference));
  }
});

test("blank model is transmitted unchanged to trigger the backend missing-model rule", () => {
  assert.equal(buildGovernancePayload({ ...governanceSample(true), model_id: "  " }).model_id, "");
});

test("all domain suggestions and a custom operational string are editable", () => {
  assert.deepEqual(DECISION_DOMAINS, ["underwriting", "credit_limit", "claims", "agent_action"]);
  for (const domain of [...DECISION_DOMAINS, "custom-domain"]) {
    assert.equal(buildGovernancePayload({ ...governanceSample(true), decision_domain: domain }).decision_domain, domain);
  }
});

for (const field of ["confidence_score", "min_confidence", "amount", "max_unsupervised_amount"]) {
  test(`${field} rejects empty, NaN, non-finite, and invalid inputs instead of defaults`, () => {
    for (const value of ["", "  ", NaN, Infinity, -Infinity, "Infinity", "0x10", "not-a-number", null, undefined, false, {}, -0.1]) {
      assert.throws(() => buildGovernancePayload({ ...governanceSample(true), [field]: value }));
    }
  });
}

for (const field of ["confidence_score", "min_confidence"]) {
  test(`${field} enforces 0..1 and accepts both boundaries`, () => {
    assert.throws(() => buildGovernancePayload({ ...governanceSample(true), [field]: 1.01 }));
    for (const value of [0, 1, "0.85"]) assert.doesNotThrow(() => buildGovernancePayload({ ...governanceSample(true), [field]: value }));
  });
}

test("zero amounts are valid rather than replaced with defaults", () => {
  const payload = buildGovernancePayload({ ...governanceSample(true), amount: "0", max_unsupervised_amount: 0 });
  assert.equal(payload.transaction_amount, 0);
  assert.equal(payload.policy_thresholds.max_unsupervised_amount, 0);
});

test("invalid boolean, missing domain, and empty subject are rejected", () => {
  for (const changes of [{ human_override_required: "false" }, { decision_domain: " " }, { subject_reference: " " }]) {
    assert.throws(() => buildGovernancePayload({ ...governanceSample(true), ...changes }));
  }
  assert.throws(() => buildGovernancePayload(initialGovernanceForm()));
});

test("operational codes reject emails, spaces/names, and SSN-like identifiers", () => {
  for (const field of ["model_id", "action", "decision_domain"]) {
    for (const value of ["person@example.test", "Personal Name", "123-45-6789", "123456789"]) {
      assert.throws(() => buildGovernancePayload({ ...governanceSample(true), [field]: value }));
    }
  }
});

test("valid PASS/HOLD receipts are retained, excluding arbitrary echoed fields", () => {
  for (const gate of ["PASS", "HOLD"]) {
    const valid = receiptFixture(gate);
    assert.deepEqual(validateGovernanceReceipt({ ...valid, raw_input: "ignored" }, valid.receipt_id), valid);
  }
});

test("every ordered subset of backend rules is a valid HOLD with its static reasons", () => {
  for (const findings of [
    [ruleFindings[0]], [ruleFindings[1]], [ruleFindings[2]],
    [ruleFindings[0], ruleFindings[1]], [ruleFindings[0], ruleFindings[2]],
    [ruleFindings[1], ruleFindings[2]], ruleFindings,
  ]) {
    const valid = { ...receiptFixture(), findings };
    assert.deepEqual(validateGovernanceReceipt(valid), valid);
  }
  const valid = { ...receiptFixture("PASS"), evaluated_at: "2026-11-25T18:00:00+00:00" };
  assert.deepEqual(validateGovernanceReceipt(valid), valid);
});

for (const [field, value] of [
  ["receipt_id", "gov_short"], ["gate", "APPROVE"], ["architecture_version", "other"],
  ["sha256_digest", "bad"], ["evaluated_at", "yesterday"], ["evaluated_at", "2026-11-25T18:00:00-05:00"],
  ["findings", null], ["findings", [{ code: "X" }]],
]) {
  test(`receipt validation rejects malformed ${field}: ${JSON.stringify(value)}`, () => {
    assert.throws(() => validateGovernanceReceipt({ ...receiptFixture(), [field]: value }));
  });
}

for (const [label, changes] of [
  ["ID/digest mismatch", { receipt_id: `gov_${"a".repeat(64)}` }],
  ["uppercase digest and ID", { receipt_id: `gov_${"B".repeat(64)}`, sha256_digest: "B".repeat(64) }],
  ["non-string ID", { receipt_id: [`gov_${"b".repeat(64)}`] }],
  ["non-string digest", { sha256_digest: ["b".repeat(64)] }],
  ["PASS with findings", { gate: "PASS" }],
  ["HOLD without findings", { findings: [] }],
  ["unknown rule code", { findings: [{ code: "UNKNOWN", reason: "Untrusted prose." }] }],
  ["legacy wrong rule code", { findings: [{ code: "LOW_CONFIDENCE", reason: ruleFindings[0].reason }] }],
  ["caller-controlled reason", { findings: [{ ...ruleFindings[0], reason: "Untrusted prose." }] }],
  ["wrong reason for valid code", { findings: [{ ...ruleFindings[0], reason: ruleFindings[1].reason }] }],
  ["whitespace-altered reason", { findings: [{ ...ruleFindings[0], reason: ` ${ruleFindings[0].reason}` }] }],
  ["duplicate rules", { findings: [ruleFindings[0], ruleFindings[0]] }],
  ["out-of-order rules", { findings: [ruleFindings[2], ruleFindings[0]] }],
  ["more than three rules", { findings: [...ruleFindings, ruleFindings[0]] }],
  ["null finding", { findings: [null] }],
]) {
  test(`receipt validation fails closed on ${label}`, () => {
    assert.throws(() => validateGovernanceReceipt({ ...receiptFixture(), ...changes }), /invalid GovernanceCheck receipt/);
  });
}

test("missing receipts fail closed", () => {
  for (const value of [null, undefined, {}]) assert.throws(() => validateGovernanceReceipt(value), /invalid GovernanceCheck receipt/);
});

test("GET receipt must match the requested ID", () => {
  assert.throws(() => validateGovernanceReceipt(receiptFixture(), `gov_${"c".repeat(64)}`));
});

test("editing, presets, and later requests invalidate stale response tokens", () => {
  const guard = createRequestGuard();
  const first = guard.invalidate();
  assert.equal(guard.isCurrent(first), true);
  const second = guard.invalidate();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});
