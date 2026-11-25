import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ARCHITECTURE_VERSION } from "../src/utils/governance.js";
import { button, componentHarness, expand, loadComponents, mockBrowser, text, walk } from "./helpers/componentHarness.js";

const { App, GovernanceCheckPage, api, API_BASE_URL } = await loadComponents();
const fixture = (gate = "HOLD") => ({
  receipt_id: `gov_${"b".repeat(64)}`, gate,
  architecture_version: ARCHITECTURE_VERSION, sha256_digest: "b".repeat(64),
  findings: gate === "HOLD" ? [
    { code: "LOW_MODEL_CONFIDENCE", reason: "Model confidence is below the policy minimum." },
    { code: "UNSUPERVISED_HIGH_VALUE_ACTION", reason: "Transaction amount exceeds the unsupervised policy maximum without required human override." },
  ] : [],
  evaluated_at: "2026-11-25T18:00:00.000Z",
});
const payloadKeys = [
  "model_id", "decision_domain", "proposed_action", "confidence_score",
  "human_override_required", "policy_thresholds", "transaction_amount", "redacted_subject_ref",
];
const invalidReceipts = () => [
  ["ID/digest mismatch", { ...fixture(), receipt_id: `gov_${"a".repeat(64)}` }],
  ["PASS with findings", { ...fixture(), gate: "PASS" }],
  ["HOLD without findings", { ...fixture(), findings: [] }],
  ["unknown rule", { ...fixture(), findings: [{ code: "UNKNOWN", reason: "Untrusted prose." }] }],
  ["wrong static reason", { ...fixture(), findings: [{ ...fixture().findings[0], reason: "Untrusted prose." }] }],
  ["duplicate rules", { ...fixture(), findings: [fixture().findings[0], fixture().findings[0]] }],
  ["wrong rule order", { ...fixture(), findings: [...fixture().findings].reverse() }],
];
const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: () => "application/json" }, json: async () => data,
});
const formElement = (tree) => walk(tree, (element) => element.type === "form");
const field = (tree, id) => walk(tree, (element) => element.props?.id === id);
const preventDefault = () => {};

function page() {
  const harness = componentHarness(GovernanceCheckPage, { apiKey: "test-api-key" });
  harness.render();
  return harness;
}
async function loadAndSubmit(harness, compliant = false) {
  button(harness.tree, compliant ? "Load Compliant AI Output (Triggers PASS)" : "Load Defective AI Output (Triggers HOLD)").props.onClick();
  harness.render();
  await formElement(harness.tree).props.onSubmit({ preventDefault });
  harness.render();
}

test("both exact preset buttons only prefill, and the reference is never displayed raw", () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return jsonResponse(fixture()); };
  const harness = page();
  for (const [label, confidence, amount, override] of [
    ["Load Defective AI Output (Triggers HOLD)", 0.68, 45000, false],
    ["Load Compliant AI Output (Triggers PASS)", 0.96, 5000, true],
  ]) {
    const control = button(harness.tree, label);
    assert.equal(control.props.type, "button");
    control.props.onClick();
    harness.render();
    assert.equal(field(harness.tree, "governance-confidence").props.value, confidence);
    assert.equal(field(harness.tree, "governance-amount").props.value, amount);
    assert.equal(field(harness.tree, "governance-override").props.checked, override);
    assert.equal(field(harness.tree, "governance-subject").props.type, "password");
    assert.match(text(expand(harness.tree)), /\*{7}0001/);
    assert.equal(text(expand(harness.tree)).includes("SAMPLE-0001"), false);
  }
  assert.equal(calls, 0);
  harness.unmount();
});

test("actual source submissions send both exact eight-key flat samples and display backend gates/findings", async () => {
  for (const compliant of [false, true]) {
    const calls = [];
    const receipt = fixture(compliant ? "PASS" : "HOLD");
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return jsonResponse(receipt); };
    const harness = page();
    await loadAndSubmit(harness, compliant);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${API_BASE_URL}/api/governance/check`);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["X-API-Key"], "test-api-key");
    const payload = JSON.parse(calls[0].options.body);
    assert.deepEqual(Object.keys(payload).sort(), [...payloadKeys].sort());
    assert.deepEqual(payload, {
      model_id: "underwriting-v1", decision_domain: "underwriting", proposed_action: "APPROVE",
      confidence_score: compliant ? 0.96 : 0.68, human_override_required: compliant,
      policy_thresholds: { min_confidence: 0.85, max_unsupervised_amount: 10000 },
      transaction_amount: compliant ? 5000 : 45000, redacted_subject_ref: "*******0001",
    });
    const rendered = text(expand(harness.tree));
    assert.match(rendered, /Redacted preview/);
    assert.ok(rendered.includes(JSON.stringify(payload, null, 2)));
    assert.ok(rendered.includes(`GATE: ${receipt.gate}`));
    for (const finding of receipt.findings) {
      assert.ok(rendered.includes(finding.code));
      assert.ok(rendered.includes(finding.reason));
    }
    assert.match(rendered, compliant ? /not legal authorization/ : /stop and review/);
    assert.equal(calls[0].options.body.includes("SAMPLE-0001"), false);
    assert.equal(rendered.includes("SAMPLE-0001"), false);
    harness.unmount();
  }
});

test("actual editable source handlers map action, amount, and masked subject into the flat allowlist", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return jsonResponse(fixture("PASS")); };
  const harness = page();
  button(harness.tree, "Load Compliant AI Output (Triggers PASS)").props.onClick();
  harness.render();
  for (const [id, value] of [
    ["governance-model", "custom-v2"], ["governance-action", "REVIEW"],
    ["governance-confidence", "0.99"], ["governance-min-confidence", "0.9"],
    ["governance-max-amount", "20000"], ["governance-amount", "123.5"],
  ]) {
    field(harness.tree, id).props.onChange(value);
    harness.render();
  }
  field(harness.tree, "governance-domain").props.onChange({ target: { value: "custom-domain" } });
  harness.render();
  field(harness.tree, "governance-override").props.onChange({ target: { checked: false } });
  harness.render();
  field(harness.tree, "governance-subject").props.onChange({ target: { value: "INTERNAL-5678" } });
  harness.render();
  await formElement(harness.tree).props.onSubmit({ preventDefault });
  harness.render();
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(Object.keys(payload).sort(), [...payloadKeys].sort());
  assert.deepEqual(payload, {
    model_id: "custom-v2", decision_domain: "custom-domain", proposed_action: "REVIEW",
    confidence_score: 0.99, human_override_required: false,
    policy_thresholds: { min_confidence: 0.9, max_unsupervised_amount: 20000 },
    transaction_amount: 123.5, redacted_subject_ref: "*********5678",
  });
  assert.equal(calls[0].options.body.includes("INTERNAL-5678"), false);
  assert.equal(text(expand(harness.tree)).includes("INTERNAL-5678"), false);
  harness.unmount();
});

test("full receipt appears only after GET and includes every digest/identity/time field", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return jsonResponse(fixture("PASS")); };
  const harness = page();
  await loadAndSubmit(harness, true);
  assert.equal(calls.length, 1);
  assert.match(text(expand(harness.tree)), /not legal authorization/);
  const pending = button(harness.tree, "View full receipt →").props.onClick();
  harness.render();
  assert.match(text(expand(harness.tree)), /Retrieving the stored receipt/);
  assert.equal(text(expand(harness.tree)).includes("b".repeat(64)), false);
  await pending;
  harness.render();
  assert.equal(calls[1].url, `${API_BASE_URL}/api/governance/checks/${fixture().receipt_id}`);
  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[1].options.body, undefined);
  const rendered = text(expand(harness.tree));
  for (const value of [fixture().receipt_id, fixture().sha256_digest, ARCHITECTURE_VERSION, fixture().evaluated_at]) assert.ok(rendered.includes(value));
  assert.ok(button(harness.tree, "Download JSON receipt"));
  assert.equal(rendered.includes("Unlock"), false);
  harness.unmount();
});

test("editing while POST is pending removes loading and ignores the old receipt", async () => {
  let resolve;
  globalThis.fetch = () => new Promise((done) => { resolve = done; });
  const harness = page();
  button(harness.tree, "Load Defective AI Output (Triggers HOLD)").props.onClick();
  harness.render();
  const pending = formElement(harness.tree).props.onSubmit({ preventDefault });
  harness.render();
  assert.equal(button(harness.tree, "Generating preview...").props.disabled, true);
  field(harness.tree, "governance-confidence").props.onChange(0.99);
  harness.render();
  resolve(jsonResponse(fixture()));
  await pending;
  harness.render();
  assert.ok(formElement(harness.tree));
  assert.equal(field(harness.tree, "governance-confidence").props.value, 0.99);
  assert.equal(text(expand(harness.tree)).includes(fixture().receipt_id), false);
  assert.equal(button(harness.tree, "Generate redacted preview →").props.disabled, false);
  harness.unmount();
});

test("loading a preset while POST is pending invalidates the earlier response", async () => {
  let resolve;
  globalThis.fetch = () => new Promise((done) => { resolve = done; });
  const harness = page();
  button(harness.tree, "Load Defective AI Output (Triggers HOLD)").props.onClick();
  harness.render();
  const pending = formElement(harness.tree).props.onSubmit({ preventDefault });
  harness.render();
  button(harness.tree, "Load Compliant AI Output (Triggers PASS)").props.onClick();
  harness.render();
  resolve(jsonResponse(fixture()));
  await pending;
  harness.render();
  assert.equal(field(harness.tree, "governance-confidence").props.value, 0.96);
  assert.equal(text(expand(harness.tree)).includes(fixture().receipt_id), false);
  harness.unmount();
});

test("returning to inputs after receipt clears the old receipt and restart clears the form", async () => {
  globalThis.fetch = async () => jsonResponse(fixture());
  const harness = page();
  await loadAndSubmit(harness);
  await button(harness.tree, "View full receipt →").props.onClick();
  harness.render();
  button(harness.tree, "1Input + redaction").props.onClick();
  harness.render();
  assert.equal(text(expand(harness.tree)).includes(fixture().receipt_id), false);
  field(harness.tree, "governance-model").props.onChange("changed-model");
  harness.render();
  await formElement(harness.tree).props.onSubmit({ preventDefault });
  harness.render();
  await button(harness.tree, "View full receipt →").props.onClick();
  harness.render();
  button(harness.tree, "Start a new check").props.onClick();
  harness.render();
  assert.equal(field(harness.tree, "governance-model").props.value, "");
  assert.equal(field(harness.tree, "governance-subject").props.value, "");
  assert.equal(text(expand(harness.tree)).includes(fixture().receipt_id), false);
  harness.unmount();
});

test("pending GET is ignored after back navigation or unmount", async () => {
  let resolve;
  globalThis.fetch = async () => jsonResponse(fixture());
  const harness = page();
  await loadAndSubmit(harness);
  globalThis.fetch = () => new Promise((done) => { resolve = done; });
  const pending = button(harness.tree, "View full receipt →").props.onClick();
  harness.render();
  button(harness.tree, "← Back to preview").props.onClick();
  harness.render();
  resolve(jsonResponse(fixture()));
  await pending;
  harness.render();
  assert.ok(button(harness.tree, "View full receipt →"));
  assert.equal(text(expand(harness.tree)).includes("SHA-256 digest"), false);
  const pendingAgain = button(harness.tree, "View full receipt →").props.onClick();
  harness.render();
  harness.unmount();
  resolve(jsonResponse(fixture()));
  await pendingAgain;
  assert.equal(text(expand(harness.render())).includes("SHA-256 digest"), false);
});

test("NaN/empty numeric input is preserved as invalid and makes no request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return jsonResponse(fixture()); };
  const harness = page();
  button(harness.tree, "Load Compliant AI Output (Triggers PASS)").props.onClick();
  harness.render();
  field(harness.tree, "governance-confidence").props.onChange(NaN);
  harness.render();
  assert.equal(field(harness.tree, "governance-confidence").props.value, "");
  await formElement(harness.tree).props.onSubmit({ preventDefault });
  harness.render();
  assert.equal(calls, 0);
  assert.match(text(expand(harness.tree)), /Confidence score is required/);
  harness.unmount();
});

test("network and invalid receipt errors remain in input; malformed receipt never becomes PASS", async () => {
  const harness = page();
  globalThis.fetch = async () => { throw new Error("offline"); };
  await loadAndSubmit(harness);
  assert.match(text(expand(harness.tree)), /Could not reach the CPS backend/);
  assert.ok(formElement(harness.tree));
  globalThis.fetch = async () => jsonResponse({ gate: "PASS" });
  await formElement(harness.tree).props.onSubmit({ preventDefault });
  harness.render();
  assert.match(text(expand(harness.tree)), /invalid GovernanceCheck receipt/);
  assert.equal(text(expand(harness.tree)).includes("GATE: PASS"), false);
  harness.unmount();
});

for (const stage of ["POST", "GET"]) {
  test(`actual ${stage} handler fails closed on receipt identity, gate, code, reason, uniqueness, and order violations`, async () => {
    for (const [label, invalid] of invalidReceipts()) {
      const harness = page();
      globalThis.fetch = async () => jsonResponse(stage === "POST" ? invalid : fixture());
      await loadAndSubmit(harness);
      if (stage === "GET") {
        globalThis.fetch = async () => jsonResponse(invalid);
        await button(harness.tree, "View full receipt →").props.onClick();
        harness.render();
      }
      const rendered = text(expand(harness.tree));
      assert.match(rendered, /invalid GovernanceCheck receipt/, label);
      assert.equal(rendered.includes("GATE:"), false, label);
      assert.equal(button(harness.tree, "Download JSON receipt"), null, label);
      if (stage === "POST") assert.ok(formElement(harness.tree), label);
      else assert.ok(button(harness.tree, "Retry receipt retrieval"), label);
      harness.unmount();
    }
  });
}

test("GET errors expose retry without inventing unlock or displaying stale preview as full receipt", async () => {
  globalThis.fetch = async () => jsonResponse(fixture());
  const harness = page();
  await loadAndSubmit(harness);
  globalThis.fetch = async () => jsonResponse({ detail: "Receipt unavailable" }, 503);
  await button(harness.tree, "View full receipt →").props.onClick();
  harness.render();
  assert.match(text(expand(harness.tree)), /Receipt unavailable/);
  assert.ok(button(harness.tree, "Retry receipt retrieval"));
  assert.equal(text(expand(harness.tree)).includes(fixture().sha256_digest), false);
  assert.equal(text(expand(harness.tree)).includes("Unlock"), false);
  globalThis.fetch = async () => jsonResponse(fixture());
  await button(harness.tree, "Retry receipt retrieval").props.onClick();
  harness.render();
  assert.ok(text(expand(harness.tree)).includes(fixture().sha256_digest));
  harness.unmount();
});

test("GET cannot silently change the gate or digest of the POST receipt", async () => {
  globalThis.fetch = async () => jsonResponse(fixture());
  const harness = page();
  await loadAndSubmit(harness);
  globalThis.fetch = async () => jsonResponse(fixture("PASS"));
  await button(harness.tree, "View full receipt →").props.onClick();
  harness.render();
  assert.match(text(expand(harness.tree)), /does not match the verified preview/);
  assert.equal(text(expand(harness.tree)).includes("GATE: PASS"), false);
  harness.unmount();
});

test("governance client encodes receipt paths and retains API key behavior", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return jsonResponse(fixture()); };
  await api.governanceReceipt("gov_unsafe/id", "key");
  assert.equal(calls[0].url, `${API_BASE_URL}/api/governance/checks/gov_unsafe%2Fid`);
  assert.equal(calls[0].options.headers["X-API-Key"], "key");
});

test("App direct governance route, tab clicks, and popstate stay in sync", () => {
  globalThis.window = mockBrowser("/governance?campaign=one");
  const harness = componentHarness(App);
  harness.render();
  assert.ok(walk(harness.tree, (element) => element.type === GovernanceCheckPage));
  button(harness.tree, "Overview").props.onClick();
  harness.render();
  assert.equal(window.location.pathname, "/");
  assert.ok(walk(harness.tree, (element) => element.type?.name === "LandingPage"));
  button(harness.tree, "GovernanceCheck").props.onClick();
  harness.render();
  assert.equal(window.location.pathname, "/governance");
  window.history.back();
  harness.render();
  assert.ok(walk(harness.tree, (element) => element.type?.name === "LandingPage"));
  window.history.forward();
  harness.render();
  assert.ok(walk(harness.tree, (element) => element.type === GovernanceCheckPage));
  assert.equal(window.history.length, 3);
  assert.equal(window.location.search, "?campaign=one");
  harness.unmount();
  assert.equal(window.listenerCount, 0);
});

test("App capture host wraps only LandingPage and routes just the GovernanceCheck anchor", () => {
  globalThis.window = mockBrowser("/");
  const harness = componentHarness(App);
  harness.render();
  const host = walk(harness.tree, (element) => typeof element.props?.onClickCapture === "function");
  assert.equal(host.props.children.type.name, "LandingPage");
  const anchor = { getAttribute: () => "mailto:admin@aspectsmediagroup.com?subject=GovernanceCheck%20Pilot" };
  let prevented = false;
  host.props.onClickCapture({ target: { closest: () => anchor }, currentTarget: { contains: () => true }, button: 0, preventDefault() { prevented = true; } });
  harness.render();
  assert.equal(prevented, true);
  assert.equal(window.location.pathname, "/governance");
  assert.ok(walk(harness.tree, (element) => element.type === GovernanceCheckPage));
  harness.unmount();
});

test("legacy checkout query cleanup still selects Billing and removes credentials only", () => {
  globalThis.window = mockBrowser("/?checkout=success&tab=billing&session_id=cs_example&campaign=one#return");
  const harness = componentHarness(App);
  harness.render();
  harness.render();
  assert.ok(walk(harness.tree, (element) => element.type?.name === "BillingPage"));
  assert.equal(window.location.search, "?campaign=one&tab=billing");
  assert.equal(window.location.hash, "#return");
  assert.match(text(harness.tree), /Subscription updated/);
  harness.unmount();
});

test("protected LandingPage and ClearCheckPage remain byte-identical to repository HEAD", async () => {
  for (const file of ["src/pages/LandingPage.jsx", "src/pages/ClearCheckPage.jsx"]) {
    assert.deepEqual(await readFile(file), execFileSync("git", ["show", `HEAD:${file}`]));
  }
});

test("existing central request and ClearCheck methods were not modified", async () => {
  const before = execFileSync("git", ["show", "HEAD:src/utils/apiClient.js"], { encoding: "utf8" });
  const after = await readFile("src/utils/apiClient.js", "utf8");
  const originalPrefix = before.includes("  // GovernanceCheck:")
    ? before.split("  // GovernanceCheck:")[0]
    : before.slice(0, before.indexOf("\n};"));
  assert.equal(after.split("  // GovernanceCheck:")[0].trimEnd(), originalPrefix.trimEnd());
});
