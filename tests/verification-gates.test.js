import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ARCHITECTURE_VERSION, GATE_FINDING_REASONS, VERIFICATION_GATES, buildGatePayload,
  gateSample, initialGateForm, validateGateReceipt,
} from "../src/utils/verificationGates.js";
import { tabFromLocation, tabUrl } from "../src/utils/navigation.js";
import { button, componentHarness, expand, loadComponents, mockBrowser, text, walk } from "./helpers/componentHarness.js";
import { loadVerificationComponents } from "./helpers/verificationHarness.js";

const components = await loadVerificationComponents();
const fixture = (gate, decision = "PASS") => ({
  receipt_id: `${VERIFICATION_GATES[gate].prefix}_${"c".repeat(64)}`,
  gate: decision, architecture_version: ARCHITECTURE_VERSION,
  findings: decision === "PASS" ? [] : VERIFICATION_GATES[gate].codes.map((code) => ({ code, reason: GATE_FINDING_REASONS[code] })),
  sha256: "c".repeat(64), timestamp: "2026-11-27T14:00:00.000Z",
});
const submit = (harness) => walk(harness.tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });

for (const [gate, config] of Object.entries(VERIFICATION_GATES)) {
  test(`${gate}: presets are fresh, editable inputs with genuinely defective and compliant declarations`, () => {
    assert.notEqual(gateSample(gate, true), gateSample(gate, true));
    assert.notDeepEqual(gateSample(gate, false), gateSample(gate, true));
    const payload = buildGatePayload(gate, gateSample(gate, true));
    assert.deepEqual(Object.keys(payload), [...config.fields.map((field) => field.key), "redacted_subject_ref"]);
    if (payload.splits_bps) assert.equal(payload.splits_bps.reduce((sum, bps) => sum + bps, 0), 10000);
    assert.equal(Object.keys(initialGateForm(gate)).length, config.fields.length + 1);
  });

  test(`${gate}: allowlist masks references and discards PII and unknown fields`, () => {
    const form = { ...gateSample(gate, true), subject_reference: "PRIVATE-0001", name: "Personal Name", email: "private@example.test", ssn: "123-45-6789", redacted_subject_ref: "RAW" };
    const payload = buildGatePayload(gate, form);
    assert.equal(payload.redacted_subject_ref, "********0001");
    for (const raw of ["PRIVATE-0001", "Personal Name", "private@example.test", "123-45-6789", "RAW"]) {
      assert.equal(JSON.stringify(payload).includes(raw), false);
    }
    assert.equal(form.subject_reference, "PRIVATE-0001");
  });

  test(`${gate}: PASS and HOLD validate with canonical fields only`, () => {
    for (const decision of ["PASS", "HOLD"]) {
      const receipt = fixture(gate, decision);
      assert.deepEqual(validateGateReceipt(gate, { ...receipt, raw_input: "PRIVATE" }), receipt);
    }
  });

  test(`${gate}: malformed and inconsistent receipts fail closed`, () => {
    const receipt = fixture(gate);
    for (const changes of [
      { gate: "APPROVE" }, { receipt_id: "wrong" }, { sha256: "a".repeat(64) },
      { architecture_version: "wrong" }, { timestamp: "yesterday" },
      { timestamp: "2026-11-27T14:00:00-05:00" }, { findings: null },
      { findings: [{ code: "UNKNOWN", reason: "Bad" }] },
      { gate: "HOLD" }, { findings: fixture(gate, "HOLD").findings },
    ]) assert.throws(() => validateGateReceipt(gate, { ...receipt, ...changes }), /invalid/);
    const hold = fixture(gate, "HOLD");
    for (const findings of [
      [...hold.findings].reverse(), [hold.findings[0], hold.findings[0]],
      [{ code: config.codes[0], reason: "Arbitrary echoed input" }],
      [{ code: config.codes[0], reason: "" }], [null],
    ]) assert.throws(() => validateGateReceipt(gate, { ...hold, findings }), /invalid/);
    for (const missing of [null, undefined, {}]) assert.throws(() => validateGateReceipt(gate, missing));
  });

  for (const compliant of [false, true]) {
    test(`${gate}: ${compliant ? "PASS" : "HOLD"} UI flow uses one real API call, redacted preview, full receipt and back/restart`, async () => {
      const calls = [];
      const originalFetch = globalThis.fetch;
      const expected = fixture(gate, compliant ? "PASS" : "HOLD");
      globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return { ok: true, headers: { get: () => "application/json" }, json: async () => expected };
      };
      const harness = componentHarness(components.VerificationGatePage, { gate, apiKey: "test-key" });
      try {
        harness.render();
        const layout = expand(harness.tree);
        const steps = walk(layout, (node) => node.type === "ol");
        assert.equal(steps.props["aria-label"], `${config.name} steps`);
        assert.equal(text(steps), "1Input + redaction→2Redacted preview→3Full receipt");
        assert.ok(walk(layout, (node) => node.type === "aside"));
        button(harness.tree, `Load ${compliant ? "Compliant" : "Defective"} ${config.sampleName} (Triggers ${compliant ? "PASS" : "HOLD"})`).props.onClick();
        harness.render();
        assert.equal(calls.length, 0);
        await submit(harness);
        harness.render();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, `https://verification.test/api/${gate}/check`);
        assert.equal(calls[0].options.method, "POST");
        assert.equal(calls[0].options.headers["X-API-Key"], "test-key");
        assert.deepEqual(JSON.parse(calls[0].options.body), buildGatePayload(gate, gateSample(gate, compliant)));
        assert.ok(text(expand(harness.tree)).includes(`GATE: ${expected.gate}`));
        assert.equal(text(expand(harness.tree)).includes("SAMPLE-0001"), false);
        button(harness.tree, "View full receipt →").props.onClick();
        harness.render();
        assert.ok(text(expand(harness.tree)).includes(expected.sha256));
        assert.ok(text(expand(harness.tree)).includes(expected.timestamp));
        assert.ok(button(harness.tree, "Download JSON receipt"));
        assert.equal(calls.length, 1);
        button(harness.tree, "← Back to preview").props.onClick();
        harness.render();
        assert.ok(button(harness.tree, "View full receipt →"));
        button(harness.tree, "View full receipt →").props.onClick();
        harness.render();
        button(harness.tree, "Start a new check").props.onClick();
        harness.render();
        assert.ok(button(harness.tree, `Load Compliant ${config.sampleName} (Triggers PASS)`));
        assert.equal(walk(expand(harness.tree), (node) => node.type === "input" && node.props.id === `${gate}-subject`).props.value, "");
      } finally {
        harness.unmount();
        globalThis.fetch = originalFetch;
      }
    });
  }

  test(`${gate}: edit and sample changes discard pending results, unmount invalidates requests`, async () => {
    let resolve;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise((done) => { resolve = done; });
    const harness = componentHarness(components.VerificationGatePage, { gate });
    const finish = () => resolve({ ok: true, headers: { get: () => "application/json" }, json: async () => fixture(gate) });
    try {
      harness.render();
      button(harness.tree, `Load Compliant ${config.sampleName} (Triggers PASS)`).props.onClick();
      harness.render();
      const pending = submit(harness);
      harness.render();
      assert.equal(walk(harness.tree, (node) => node.type === "button" && node.props.type === "submit").props.disabled, true);
      walk(expand(harness.tree), (node) => node.type === "input" && node.props.id === `${gate}-subject`).props.onChange({ target: { value: "EDIT-0002" } });
      harness.render();
      finish();
      await pending;
      harness.render();
      assert.equal(text(expand(harness.tree)).includes("GATE: PASS"), false);
      const second = submit(harness);
      harness.render();
      button(harness.tree, `Load Defective ${config.sampleName} (Triggers HOLD)`).props.onClick();
      harness.render();
      finish();
      await second;
      harness.render();
      assert.equal(text(expand(harness.tree)).includes("GATE: PASS"), false);
      button(harness.tree, `Load Compliant ${config.sampleName} (Triggers PASS)`).props.onClick();
      harness.render();
      const third = submit(harness);
      harness.unmount();
      finish();
      await third;
      harness.render();
      assert.equal(text(expand(harness.tree)).includes("GATE: PASS"), false);
    } finally {
      harness.unmount();
      globalThis.fetch = originalFetch;
    }
  });

  test(`${gate}: network and invalid receipt errors never show PASS or advance the step`, async () => {
    const originalFetch = globalThis.fetch;
    const harness = componentHarness(components.VerificationGatePage, { gate });
    try {
      harness.render();
      button(harness.tree, `Load Compliant ${config.sampleName} (Triggers PASS)`).props.onClick();
      harness.render();
      for (const responder of [
        async () => { throw new Error("Offline"); },
        async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ ...fixture(gate), sha256: "bad" }) }),
        async () => ({ ok: false, status: 503, headers: { get: () => "application/json" }, json: async () => ({ detail: "Try again" }) }),
      ]) {
        globalThis.fetch = responder;
        await submit(harness);
        harness.render();
        assert.ok(walk(expand(harness.tree), (node) => node.props.role === "alert"));
        assert.equal(text(expand(harness.tree)).includes("GATE: PASS"), false);
        assert.equal(button(harness.tree, "View full receipt →"), null);
      }
    } finally {
      harness.unmount();
      globalThis.fetch = originalFetch;
    }
  });

  test(`${gate}: numeric and boolean types do not silently become valid defaults`, () => {
    for (const field of config.fields) {
      if (["integer", "number"].includes(field.type)) {
        for (const value of ["", "  ", null, undefined, NaN, Infinity, false, "0x10", {}]) {
          assert.throws(() => buildGatePayload(gate, { ...gateSample(gate, true), [field.key]: value }));
        }
        if (field.type === "integer") for (const value of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
          assert.throws(() => buildGatePayload(gate, { ...gateSample(gate, true), [field.key]: value }));
        }
      } else if (field.type === "boolean") {
        for (const value of ["true", "false", 1, 0, null]) assert.throws(() => buildGatePayload(gate, { ...gateSample(gate, true), [field.key]: value }));
      } else if (field.type === "code") {
        for (const value of ["Personal Name", "private@example.test", "123-45-6789", "123456789", null]) assert.throws(() => buildGatePayload(gate, { ...gateSample(gate, true), [field.key]: value }));
        assert.equal(buildGatePayload(gate, { ...gateSample(gate, true), [field.key]: " " })[field.key], "");
      } else if (field.type === "splits") {
        for (const value of ["6000.5, 3999.5", "6000,", "NaN", "6000, false", []]) assert.throws(() => buildGatePayload(gate, { ...gateSample(gate, true), [field.key]: value }));
        assert.deepEqual(buildGatePayload(gate, { ...gateSample(gate, true), [field.key]: "" })[field.key], []);
      }
    }
  });
}

for (const [Page, gate] of [
  [components.SettlementCheckPage, "settlement"], [components.ProvenanceCheckPage, "provenance"],
  [components.CustodyCheckPage, "custody"], [components.EdgeVerifyPage, "edge"],
]) {
  test(`${gate}: named page delegates to the shared layout with the correct API key`, () => {
    const page = Page({ apiKey: "key" });
    assert.equal(page.type, components.VerificationGatePage);
    assert.deepEqual(page.props, { gate, apiKey: "key" });
  });
}

for (const [path, gate] of [
  ["settlement", "settlement"], ["provenance", "provenance"], ["musicguard", "provenance"],
  ["custody", "custody"], ["custos", "custody"], ["edge", "edge"],
]) {
  test(`/${path}: direct path and alias support trailing slash, canonical tab URLs, and payment precedence`, () => {
    for (const ending of ["", "/"]) {
      const location = new URL(`https://frontend.test/${path}${ending}?utm=x#proof`);
      assert.equal(tabFromLocation(location), gate);
      assert.equal(tabUrl(location, gate), `/${gate}?utm=x#proof`);
      assert.equal(tabUrl(location, "home"), "/?utm=x#proof");
      assert.equal(tabUrl(location, "billing"), "/?utm=x&tab=billing#proof");
      assert.equal(tabFromLocation(new URL(`${location.origin}${location.pathname}?trial=active`)), "billing");
      assert.equal(tabFromLocation(new URL(`${location.origin}${location.pathname}?check_id=cc_test`)), "clearcheck");
      assert.equal(tabFromLocation(new URL(`${location.origin}${location.pathname}?checkout=success`)), "billing");
    }
  });
}

test("unknown paths cannot resolve inherited alias keys", () => {
  for (const path of ["__proto__", "constructor", "toString"]) assert.equal(tabFromLocation(new URL(`https://frontend.test/${path}`)), "home");
});

test("all four gates appear alongside existing navigation and support back/forward", async () => {
  const { App } = await loadComponents();
  const previousWindow = globalThis.window;
  const browser = mockBrowser("/settlement");
  globalThis.window = browser;
  const harness = componentHarness(App);
  try {
    harness.render();
    for (const label of ["ClearCheck", "GovernanceCheck", "SettlementCheck", "ProvenanceCheck", "CustodyCheck", "EdgeVerify"]) assert.ok(button(harness.tree, label));
    button(harness.tree, "ProvenanceCheck").props.onClick();
    harness.render();
    assert.equal(browser.location.pathname, "/provenance");
    button(harness.tree, "EdgeVerify").props.onClick();
    harness.render();
    assert.equal(browser.location.pathname, "/edge");
    browser.history.back();
    harness.render();
    assert.equal(browser.location.pathname, "/provenance");
    browser.history.forward();
    harness.render();
    assert.equal(browser.location.pathname, "/edge");
  } finally {
    harness.unmount();
    globalThis.window = previousWindow;
  }
});

test("JSON receipt download contains only the canonical receipt and revokes its object URL", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  let blob;
  let clicked = false;
  let revoked;
  const anchor = { click() { clicked = true; } };
  globalThis.window = { setTimeout(fn) { fn(); } };
  globalThis.document = { createElement(tag) { assert.equal(tag, "a"); return anchor; } };
  URL.createObjectURL = (value) => { blob = value; return "blob:test"; };
  URL.revokeObjectURL = (value) => { revoked = value; };
  try {
    const receipt = fixture("settlement");
    components.downloadReceipt(receipt);
    assert.equal(clicked, true);
    assert.equal(anchor.href, "blob:test");
    assert.equal(anchor.download, `${receipt.receipt_id}.json`);
    assert.equal(blob.type, "application/json");
    assert.equal(await blob.text(), `${JSON.stringify(receipt, null, 2)}\n`);
    assert.equal(revoked, "blob:test");
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});

test("new gate code does not persist inputs or introduce billing calls", async () => {
  const source = await readFile(new URL("../src/components/VerificationGatePage.jsx", import.meta.url), "utf8");
  assert.equal(/localStorage|sessionStorage|console\.|stripe|checkout/i.test(source), false);
});
