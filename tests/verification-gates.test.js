import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
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
  test(`${gate}: named page delegates to the shared layout with the correct API key`, async () => {
    if (gate !== "provenance") {
      const page = Page({ apiKey: "key" });
      assert.equal(page.type, components.VerificationGatePage);
      assert.deepEqual(page.props, { gate, apiKey: "key" });
      return;
    }
    const originalFetch = globalThis.fetch;
    const calls = [];
    const harness = componentHarness(Page, { apiKey: "key" });
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, headers: { get: () => "application/json" }, json: async () => fixture(gate) };
    };
    try {
      harness.render();
      const layout = expand(harness.tree);
      assert.equal(walk(layout, (node) => node.type === "ol").props["aria-label"], "ProvenanceCheck steps");
      assert.equal(text(walk(layout, (node) => node.type === "ol")), "1Input + redaction→2Redacted preview→3Full receipt");
      assert.ok(walk(layout, (node) => node.type === "aside"));
      button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
      harness.render();
      assert.equal(calls.length, 0);
      await submit(harness);
      harness.render();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://verification.test/api/provenance/check");
      assert.equal(calls[0].options.method, "POST");
      assert.equal(calls[0].options.headers["X-API-Key"], "key");
      assert.deepEqual(JSON.parse(calls[0].options.body), buildGatePayload(gate, {
        ...gateSample(gate, true), splits_bps: "7000, 3000, 0, 0",
      }));
      assert.ok(text(expand(harness.tree)).includes("GATE: PASS"));
      assert.equal(text(expand(harness.tree)).includes("SAMPLE-0001"), false);
    } finally {
      harness.unmount();
      globalThis.fetch = originalFetch;
    }
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

test("provenance: overview drawer precedes the progress steps, toggles accessibly, and reports a missing video", () => {
  const harness = componentHarness(components.ProvenanceCheckPage);
  try {
    harness.render();
    let layout = expand(harness.tree);
    const children = layout.props.children.filter((child) => child && typeof child === "object");
    const stepIndex = children.findIndex((child) => child.type === "ol");
    assert.ok(stepIndex > 0);
    assert.ok(walk(children[stepIndex - 1], (node) => node.type === "button" && text(node).startsWith("Watch MusicGuard Overview (60s)")));
    let toggle = walk(layout, (node) => node.type === "button" && text(node).startsWith("Watch MusicGuard Overview (60s)"));
    assert.equal(toggle.props.type, "button");
    assert.equal(toggle.props["aria-expanded"], false);
    assert.equal(walk(layout, (node) => node.type === "video"), null);
    toggle.props.onClick();
    harness.render();
    layout = expand(harness.tree);
    toggle = walk(layout, (node) => node.type === "button" && text(node).startsWith("Watch MusicGuard Overview (60s)"));
    assert.equal(toggle.props["aria-expanded"], true);
    const video = walk(layout, (node) => node.type === "video");
    assert.ok(video);
    assert.equal(video.props.src, "/videos/musicguard-overview.mp4");
    assert.equal(video.props.controls, true);
    assert.equal(video.props.preload, "metadata");
    video.props.onError();
    harness.render();
    assert.ok(text(expand(harness.tree)).includes("Drop musicguard-overview.mp4 into public/videos/ to enable the narrated executive walkthrough."));
    walk(expand(harness.tree), (node) => node.type === "button" && text(node).startsWith("Watch MusicGuard Overview (60s)")).props.onClick();
    harness.render();
    layout = expand(harness.tree);
    assert.equal(walk(layout, (node) => node.type === "button" && text(node).startsWith("Watch MusicGuard Overview (60s)")).props["aria-expanded"], false);
    assert.equal(walk(layout, (node) => node.type === "video"), null);
    assert.equal(text(layout).includes("Drop musicguard-overview.mp4 into public/videos/ to enable the narrated executive walkthrough."), false);
  } finally {
    harness.unmount();
  }
});

test("provenance: NotebookLM walkthrough link is prominent and secure beside the video and after failure", () => {
  const harness = componentHarness(components.ProvenanceCheckPage);
  const label = "Open 1:20 Narrated Walkthrough in NotebookLM ↗";
  try {
    harness.render();
    assert.equal(walk(expand(harness.tree), (node) => node.type === "a" && text(node) === label), null);
    walk(expand(harness.tree), (node) => node.type === "button" && text(node).startsWith("Watch MusicGuard Overview (60s)")).props.onClick();
    harness.render();
    for (const failed of [false, true]) {
      const layout = expand(harness.tree);
      const drawer = walk(layout, (node) => node.props.id === "musicguard-walkthrough");
      const link = walk(drawer, (node) => node.type === "a" && text(node) === label);
      assert.ok(link);
      assert.equal(link.props.href, "https://notebooklm.link.google/PYLJI66rOOxj");
      assert.equal(link.props.target, "_blank");
      assert.equal(link.props.rel, "noopener noreferrer");
      assert.match(link.props.className, /bg-signal/);
      assert.match(link.props.className, /text-white/);
      const video = walk(drawer, (node) => node.type === "video");
      if (!failed) {
        assert.ok(video);
        video.props.onError();
        harness.render();
      } else {
        assert.equal(video, null);
        assert.ok(text(drawer).includes("Drop musicguard-overview.mp4 into public/videos/ to enable the narrated executive walkthrough."));
      }
    }
  } finally {
    harness.unmount();
  }
});

test("provenance: split sliders conserve only exact totals, sync both ways, and pad both presets", () => {
  const harness = componentHarness(components.ProvenanceCheckPage);
  const roles = ["artist", "producer", "songwriter", "distributor"];
  try {
    harness.render();
    for (const compliant of [true, false]) {
      button(harness.tree, `Load ${compliant ? "Compliant" : "Defective"} Music Provenance (Triggers ${compliant ? "PASS" : "HOLD"})`).props.onClick();
      harness.render();
      const layout = expand(harness.tree);
      assert.deepEqual(roles.map((role) => {
        const slider = walk(layout, (node) => node.props.id === `provenance-split-${role}`);
        assert.equal(slider.type, "input");
        assert.equal(slider.props.type, "range");
        assert.equal(Number(slider.props.min), 0);
        assert.equal(Number(slider.props.max), 10000);
        assert.equal(Number(slider.props.step), 50);
        return Number(slider.props.value);
      }), compliant ? [7000, 3000, 0, 0] : [7000, 2000, 0, 0]);
      assert.deepEqual(walk(layout, (node) => node.props.id === "provenance-splits_bps").props.value.split(",").map(Number), compliant ? [7000, 3000, 0, 0] : [7000, 2000, 0, 0]);
      assert.ok(text(layout).includes(compliant ? "Total: 10000 / 10,000 bps (100%)" : "Total: 9000 / 10,000 bps (90%)"));
      const notice = walk(layout, (node) => node.type === "p" && text(node) === (compliant ? "PASS: Exact 10,000 bps conserved" : "HOLD: SPLIT_CONSERVATION_VIOLATION — off by 1000 bps"));
      assert.ok(notice);
      const conservation = walk(layout, (node) => node.props.role === "status" && text(node).includes(text(notice)));
      assert.match(conservation.props.className, compliant ? /(?:green|emerald|risk-low)/ : /(?:amber|yellow)/);
    }
    for (const [value, expected, total, percent, difference] of [
      ["6000, 4000", [6000, 4000, 0, 0], 10000, 100, 0],
      ["6001, 3999, 0, 0", [6001, 3999, 0, 0], 10000, 100, 0],
      ["0", [0, 0, 0, 0], 0, 0, 10000],
      ["7000, 3000, 500, 0", [7000, 3000, 500, 0], 10500, 105, 500],
    ]) {
      walk(expand(harness.tree), (node) => node.props.id === "provenance-splits_bps").props.onChange({ target: { value } });
      harness.render();
      const layout = expand(harness.tree);
      assert.equal(walk(layout, (node) => node.props.id === "provenance-splits_bps").props.value, value);
      assert.deepEqual(roles.map((role) => Number(walk(layout, (node) => node.props.id === `provenance-split-${role}`).props.value)), expected);
      assert.ok(text(layout).includes(`Total: ${total} / 10,000 bps (${percent}%)`));
      assert.ok(text(layout).includes(difference ? `HOLD: SPLIT_CONSERVATION_VIOLATION — off by ${difference} bps` : "PASS: Exact 10,000 bps conserved"));
    }
    walk(expand(harness.tree), (node) => node.props.id === "provenance-split-distributor").props.onChange({ target: { value: "1000" } });
    harness.render();
    const layout = expand(harness.tree);
    assert.deepEqual(walk(layout, (node) => node.props.id === "provenance-splits_bps").props.value.split(",").map(Number), [7000, 3000, 500, 1000]);
    assert.deepEqual(roles.map((role) => Number(walk(layout, (node) => node.props.id === `provenance-split-${role}`).props.value)), [7000, 3000, 500, 1000]);
    assert.ok(text(layout).includes("Total: 11500 / 10,000 bps (115%)"));
    assert.ok(text(layout).includes("HOLD: SPLIT_CONSERVATION_VIOLATION — off by 1500 bps"));
  } finally {
    harness.unmount();
  }
});

test("provenance: malformed or over-four split declarations fail locally and never silently authorize", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, headers: { get: () => "application/json" }, json: async () => fixture("provenance") };
  };
  const harness = componentHarness(components.ProvenanceCheckPage);
  try {
    harness.render();
    button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
    harness.render();
    for (const value of ["2000, 2000, 2000, 2000, 2000", "6000.5, 3999.5", "6000,", "NaN", "6000, false", "6000, nonsense", "9007199254740993, 0"]) {
      walk(expand(harness.tree), (node) => node.props.id === "provenance-splits_bps").props.onChange({ target: { value } });
      harness.render();
      let layout = expand(harness.tree);
      assert.equal(walk(layout, (node) => node.props.id === "provenance-splits_bps").props.value, value);
      assert.ok(text(layout).includes("HOLD:"), `Expected a local HOLD for ${value}`);
      assert.equal(text(layout).includes("PASS: Exact 10,000 bps conserved"), false);
      await submit(harness);
      harness.render();
      layout = expand(harness.tree);
      assert.equal(calls, 0, `Malformed split declaration must not reach the API: ${value}`);
      assert.equal(text(layout).includes("GATE: PASS"), false);
      assert.equal(button(layout, "View full receipt →"), null);
      assert.ok(walk(layout, (node) => node.props.role === "alert"));
    }
    walk(expand(harness.tree), (node) => node.props.id === "provenance-splits_bps").props.onChange({ target: { value: "5000, 5000" } });
    harness.render();
    assert.ok(text(expand(harness.tree)).includes("PASS: Exact 10,000 bps conserved"));
    await submit(harness);
    harness.render();
    assert.equal(calls, 1);
    assert.ok(button(harness.tree, "View full receipt →"));
  } finally {
    harness.unmount();
    globalThis.fetch = originalFetch;
  }
});

for (const source of ["picker", "drop"]) {
  test(`provenance: ${source} hashes actual audio bytes locally with SHA-256 and performs zero requests`, async () => {
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let reads = 0;
    let digests = 0;
    let releaseRead;
    const bytes = new TextEncoder().encode("local audio bytes\u0000\u0001\u00ff");
    const file = {
      name: source === "picker" ? "recording.wav" : "recording.flac",
      type: source === "picker" ? "audio/wav" : "",
      size: bytes.byteLength,
      arrayBuffer() { reads++; return new Promise((resolve) => { releaseRead = () => resolve(bytes.buffer); }); },
    };
    globalThis.window = { crypto: { subtle: { async digest(algorithm, buffer) {
      digests++;
      assert.equal(algorithm, "SHA-256");
      assert.deepEqual(new Uint8Array(buffer), bytes);
      return webcrypto.subtle.digest(algorithm, buffer);
    } } } };
    globalThis.fetch = async () => { calls++; throw new Error("No request is allowed before explicit preview"); };
    const harness = componentHarness(components.ProvenanceCheckPage);
    try {
      harness.render();
      const layout = expand(harness.tree);
      const section = walk(layout, (node) => node.type === "section" && node.props["aria-labelledby"] === "provenance-input-heading");
      assert.ok(section);
      assert.ok(text(section).includes("Recording provenance"));
      const zone = walk(section, (node) => node.props["data-testid"] === "audio-dropzone");
      const input = walk(zone, (node) => node.props.id === "provenance-audio-file");
      assert.ok(input);
      assert.equal(input.props.type, "file");
      assert.equal(input.props.accept, "audio/*,.wav,.mp3,.flac,.aiff,.m4a");
      const ordered = [];
      walk(section, (node) => {
        if (node.props["data-testid"] === "audio-dropzone" || node.type === "input") ordered.push(node);
        return false;
      });
      assert.equal(ordered[ordered.indexOf(input) + 1].props.id, "provenance-audio_fingerprint_sha256");
      let prevented = false;
      const pending = source === "picker"
        ? input.props.onChange({ target: { files: [file], value: "recording.wav" } })
        : zone.props.onDrop({ preventDefault() { prevented = true; }, dataTransfer: { files: [file] } });
      if (source === "drop") assert.equal(prevented, true);
      harness.render();
      assert.match(text(expand(harness.tree)), /hashing/i);
      assert.equal(calls, 0);
      assert.equal(reads, 1);
      releaseRead();
      await pending;
      harness.render();
      const finished = expand(harness.tree);
      const fingerprint = walk(finished, (node) => node.props.id === "provenance-audio_fingerprint_sha256").props.value;
      assert.equal(fingerprint, createHash("sha256").update(bytes).digest("hex"));
      assert.match(fingerprint, /^[a-f0-9]{64}$/);
      assert.equal(digests, 1);
      assert.ok(text(finished).includes(file.name));
      assert.ok(text(finished).includes(`${file.size} bytes`));
      assert.ok(text(finished).includes("Hashed locally in browser — zero audio uploaded"));
      assert.equal(calls, 0);
    } finally {
      harness.unmount();
      globalThis.window = originalWindow;
      globalThis.fetch = originalFetch;
    }
  });
}

test("provenance: unavailable WebCrypto, file read failures, and invalid files show local errors without requests", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  try {
    for (const failure of ["webcrypto", "read", "digest", "invalid-type", "invalid-file"]) {
      globalThis.window = failure === "webcrypto" ? {} : { crypto: failure === "digest"
        ? { subtle: { digest: async () => { throw new Error("Digest failed"); } } }
        : webcrypto };
      let reads = 0;
      const file = {
        name: failure === "invalid-type" ? "notes.txt" : "recording.mp3",
        type: failure === "invalid-type" ? "text/plain" : "audio/mpeg",
        size: 3,
        async arrayBuffer() { reads++; if (failure === "read") throw new Error("File read failed"); return new Uint8Array([1, 2, 3]).buffer; },
      };
      if (failure === "invalid-file") delete file.arrayBuffer;
      const harness = componentHarness(components.ProvenanceCheckPage);
      try {
        harness.render();
        await walk(expand(harness.tree), (node) => node.props.id === "provenance-audio-file").props.onChange({ target: { files: [file], value: file.name } });
        harness.render();
        const layout = expand(harness.tree);
        const alert = walk(layout, (node) => node.props.role === "alert");
        assert.ok(alert, `Expected a local error for ${failure}`);
        assert.match(text(alert), /(?:WebCrypto|SHA-256|unavailable|secure|read|hash|failed|unable|audio|file)/i);
        assert.equal(walk(layout, (node) => node.props.id === "provenance-audio_fingerprint_sha256").props.value, "");
        assert.equal(text(layout).includes("Hashed locally in browser — zero audio uploaded"), false);
        assert.equal(calls, 0);
        if (failure === "invalid-type" || failure === "invalid-file") assert.equal(reads, 0);
      } finally {
        harness.unmount();
      }
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test("provenance: selecting a newer file invalidates older file-read and digest completions", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  try {
    for (const stage of ["read", "digest"]) {
      let releaseOld;
      let oldDigestStarted;
      const started = new Promise((resolve) => { oldDigestStarted = resolve; });
      const oldBytes = new Uint8Array([1, 2, 3]).buffer;
      const newBytes = new Uint8Array([4, 5, 6]).buffer;
      globalThis.window = { crypto: { subtle: { digest(algorithm, buffer) {
        if (stage === "digest" && buffer === oldBytes) {
          oldDigestStarted();
          return new Promise((resolve) => { releaseOld = async () => resolve(await webcrypto.subtle.digest(algorithm, buffer)); });
        }
        return webcrypto.subtle.digest(algorithm, buffer);
      } } } };
      const harness = componentHarness(components.ProvenanceCheckPage);
      try {
        harness.render();
        const oldFile = { name: "old.wav", type: "audio/wav", size: 3, arrayBuffer: stage === "read"
          ? () => new Promise((resolve) => { releaseOld = () => resolve(oldBytes); })
          : async () => oldBytes };
        const oldPending = walk(expand(harness.tree), (node) => node.props.id === "provenance-audio-file").props.onChange({ target: { files: [oldFile], value: "old.wav" } });
        if (stage === "digest") await started;
        harness.render();
        const newFile = { name: "new.wav", type: "audio/wav", size: 3, arrayBuffer: async () => newBytes };
        await walk(expand(harness.tree), (node) => node.props["data-testid"] === "audio-dropzone").props.onDrop({ preventDefault() {}, dataTransfer: { files: [newFile] } });
        harness.render();
        const expected = createHash("sha256").update(new Uint8Array(newBytes)).digest("hex");
        assert.equal(walk(expand(harness.tree), (node) => node.props.id === "provenance-audio_fingerprint_sha256").props.value, expected);
        await releaseOld();
        await oldPending;
        harness.render();
        const layout = expand(harness.tree);
        assert.equal(walk(layout, (node) => node.props.id === "provenance-audio_fingerprint_sha256").props.value, expected);
        assert.ok(text(layout).includes("new.wav"));
        assert.equal(text(layout).includes("old.wav"), false);
        assert.equal(calls, 0);
      } finally {
        harness.unmount();
      }
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test("provenance: pending local hashes cannot overwrite edits, presets, navigation, restart, or unmount", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, headers: { get: () => "application/json" }, json: async () => fixture("provenance") };
  };
  try {
    for (const stage of ["read", "digest"]) {
      for (const action of ["fingerprint", "isrc", "subject", "rights", "splits", "slider", "compliant", "defective", "input-step", "preview-step", "edit", "receipt", "back", "restart", "unmount"]) {
        const harness = componentHarness(components.ProvenanceCheckPage);
        let release;
        let digestStarted;
        const started = new Promise((resolve) => { digestStarted = resolve; });
        const bytes = new Uint8Array([10, 20, 30]).buffer;
        globalThis.window = { crypto: { subtle: { digest(algorithm, buffer) {
          digestStarted();
          return new Promise((resolve) => { release = async () => resolve(await webcrypto.subtle.digest(algorithm, buffer)); });
        } } } };
        try {
          harness.render();
          button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
          harness.render();
          const picker = walk(expand(harness.tree), (node) => node.props.id === "provenance-audio-file");
          let navigate;
          if (["input-step", "preview-step", "edit", "receipt", "back", "restart"].includes(action)) {
            await submit(harness);
            harness.render();
            if (action === "edit") navigate = button(harness.tree, "← Edit inputs").props.onClick;
            if (action === "receipt") navigate = button(harness.tree, "View full receipt →").props.onClick;
            if (["input-step", "preview-step", "back", "restart"].includes(action)) {
              button(harness.tree, "View full receipt →").props.onClick();
              harness.render();
              if (action === "input-step") navigate = button(harness.tree, "1Input + redaction").props.onClick;
              if (action === "preview-step") navigate = button(harness.tree, "2Redacted preview").props.onClick;
              if (action === "back") navigate = button(harness.tree, "← Back to preview").props.onClick;
              if (action === "restart") navigate = button(harness.tree, "Start a new check").props.onClick;
            }
          }
          const callsBeforeHash = calls;
          const file = { name: "stale.wav", type: "audio/wav", size: 3, arrayBuffer: stage === "read"
            ? () => new Promise((resolve) => { release = () => resolve(bytes); })
            : async () => bytes };
          // Retained handlers also cover queued navigation events against an in-flight local hash.
          const pending = picker.props.onChange({ target: { files: [file], value: "stale.wav" } });
          if (stage === "digest") await started;
          harness.render();
          if (navigate) navigate();
          else if (action === "unmount") harness.unmount();
          else if (action === "compliant" || action === "defective") {
            button(harness.tree, `Load ${action === "compliant" ? "Compliant" : "Defective"} Music Provenance (Triggers ${action === "compliant" ? "PASS" : "HOLD"})`).props.onClick();
          } else {
            const id = {
              fingerprint: "provenance-audio_fingerprint_sha256", isrc: "provenance-isrc",
              subject: "provenance-subject", rights: "provenance-rights_cleared",
              splits: "provenance-splits_bps", slider: "provenance-split-artist",
            }[action];
            walk(expand(harness.tree), (node) => node.props.id === id).props.onChange({ target: {
              value: action === "fingerprint" ? "d".repeat(64) : action === "isrc" ? "USAAA2600002" : action === "subject" ? "EDIT-0002" : action === "splits" ? "5000, 5000" : "6500",
              checked: false,
            } });
          }
          harness.render();
          const before = text(expand(harness.tree));
          await release();
          await pending;
          harness.render();
          assert.equal(text(expand(harness.tree)), before, `${stage} completion changed UI after ${action}`);
          assert.equal(text(expand(harness.tree)).includes("stale.wav"), false);
          assert.equal(calls, callsBeforeHash, `${action} must not upload audio or trigger a new API call`);
        } finally {
          harness.unmount();
        }
      }
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

for (const decision of ["PASS", "HOLD"]) {
  test(`provenance: ${decision} canonical three-step POST flow preserves local hash, slider edits, redaction, and receipt download`, async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    const expectedReceipt = fixture("provenance", decision);
    const calls = [];
    let downloaded;
    let clicked = false;
    let revoked;
    const anchor = { click() { clicked = true; } };
    globalThis.window = { crypto: webcrypto, setTimeout(fn) { fn(); } };
    globalThis.document = { createElement(tag) { assert.equal(tag, "a"); return anchor; } };
    URL.createObjectURL = (blob) => { downloaded = blob; return "blob:provenance"; };
    URL.revokeObjectURL = (url) => { revoked = url; };
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ ...expectedReceipt, raw_input: "PRIVATE-0002", file_name: "recording.wav" }) };
    };
    const harness = componentHarness(components.ProvenanceCheckPage, { apiKey: "studio-key" });
    try {
      harness.render();
      button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
      harness.render();
      const file = { name: "recording.wav", type: "audio/wav", size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
      await walk(expand(harness.tree), (node) => node.props.id === "provenance-audio-file").props.onChange({ target: { files: [file], value: file.name } });
      harness.render();
      walk(expand(harness.tree), (node) => node.props.id === "provenance-split-artist").props.onChange({ target: { value: decision === "PASS" ? "6500" : "6000" } });
      harness.render();
      walk(expand(harness.tree), (node) => node.props.id === "provenance-split-producer").props.onChange({ target: { value: "3500" } });
      harness.render();
      walk(expand(harness.tree), (node) => node.props.id === "provenance-subject").props.onChange({ target: { value: "PRIVATE-0002" } });
      harness.render();
      assert.equal(calls.length, 0);
      assert.equal(walk(expand(harness.tree), (node) => node.props.id === "provenance-audio_fingerprint_sha256").props.value, expectedHash);
      await submit(harness);
      harness.render();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://verification.test/api/provenance/check");
      assert.equal(calls[0].options.method, "POST");
      assert.equal(calls[0].options.headers["X-API-Key"], "studio-key");
      const expectedPayload = buildGatePayload("provenance", {
        ...gateSample("provenance", true), subject_reference: "PRIVATE-0002", audio_fingerprint_sha256: expectedHash,
        splits_bps: decision === "PASS" ? "6500, 3500, 0, 0" : "6000, 3500, 0, 0",
      });
      assert.deepEqual(JSON.parse(calls[0].options.body), expectedPayload);
      for (const secret of ["PRIVATE-0002", "recording.wav", "arrayBuffer", "audio_file", "file_name", "raw_input"]) assert.equal(calls[0].options.body.includes(secret), false);
      const preview = expand(harness.tree);
      assert.equal(button(preview, "2Redacted preview").props["aria-current"], "step");
      assert.equal(text(walk(preview, (node) => node.type === "pre")), JSON.stringify(expectedPayload, null, 2));
      assert.ok(text(preview).includes(`GATE: ${decision}`));
      assert.equal(text(preview).includes("PRIVATE-0002"), false);
      assert.equal(text(preview).includes("recording.wav"), false);
      button(harness.tree, "View full receipt →").props.onClick();
      harness.render();
      const full = expand(harness.tree);
      assert.equal(button(full, "3Full receipt").props["aria-current"], "step");
      for (const value of [expectedReceipt.receipt_id, expectedReceipt.sha256, expectedReceipt.architecture_version, expectedReceipt.timestamp]) assert.ok(text(full).includes(value));
      for (const finding of expectedReceipt.findings) {
        assert.ok(text(full).includes(finding.code));
        assert.ok(text(full).includes(finding.reason));
      }
      button(harness.tree, "Download JSON receipt").props.onClick();
      assert.equal(clicked, true);
      assert.equal(anchor.href, "blob:provenance");
      assert.equal(anchor.download, `${expectedReceipt.receipt_id}.json`);
      assert.equal(downloaded.type, "application/json");
      assert.equal(await downloaded.text(), `${JSON.stringify(expectedReceipt, null, 2)}\n`);
      assert.equal(revoked, "blob:provenance");
      assert.equal(calls.length, 1);
      button(harness.tree, "← Back to preview").props.onClick();
      harness.render();
      assert.ok(button(harness.tree, "View full receipt →"));
      button(harness.tree, "View full receipt →").props.onClick();
      harness.render();
      button(harness.tree, "Start a new check").props.onClick();
      harness.render();
      assert.equal(walk(expand(harness.tree), (node) => node.props.id === "provenance-audio_fingerprint_sha256").props.value, "");
      assert.equal(walk(expand(harness.tree), (node) => node.props.id === "provenance-splits_bps").props.value, "");
      assert.equal(walk(expand(harness.tree), (node) => node.props.id === "provenance-subject").props.value, "");
      assert.equal(text(expand(harness.tree)).includes("recording.wav"), false);
      assert.equal(text(expand(harness.tree)).includes("GATE:"), false);
      assert.equal(calls.length, 1);
    } finally {
      harness.unmount();
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      globalThis.fetch = originalFetch;
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
    }
  });
}

test("provenance: dedicated page rejects network failures and noncanonical receipts without advancing", async () => {
  const originalFetch = globalThis.fetch;
  const harness = componentHarness(components.ProvenanceCheckPage);
  try {
    harness.render();
    button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
    harness.render();
    const receipt = fixture("provenance");
    for (const response of [
      new Error("Offline"),
      { ok: false, status: 503, headers: { get: () => "application/json" }, json: async () => ({ detail: "Try again" }) },
      ...[
        { gate: "APPROVE" }, { receipt_id: "wrong" }, { sha256: "a".repeat(64) },
        { architecture_version: "wrong" }, { timestamp: "yesterday" },
        { timestamp: "2026-11-27T14:00:00-05:00" }, { findings: null },
        { findings: [{ code: "UNKNOWN", reason: "Bad" }] }, { gate: "HOLD" },
        { findings: fixture("provenance", "HOLD").findings },
        { gate: "HOLD", findings: [...fixture("provenance", "HOLD").findings].reverse() },
        { gate: "HOLD", findings: [fixture("provenance", "HOLD").findings[0], fixture("provenance", "HOLD").findings[0]] },
        { gate: "HOLD", findings: [{ code: "MISSING_PROVENANCE_HASH", reason: "Caller-controlled reason" }] },
      ].map((changes) => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ ...receipt, ...changes }) })),
    ]) {
      globalThis.fetch = async () => { if (response instanceof Error) throw response; return response; };
      await submit(harness);
      harness.render();
      const layout = expand(harness.tree);
      assert.ok(walk(layout, (node) => node.props.role === "alert"));
      assert.equal(button(layout, "1Input + redaction").props["aria-current"], "step");
      assert.equal(text(layout).includes("GATE: PASS"), false);
      assert.equal(button(layout, "View full receipt →"), null);
    }
  } finally {
    harness.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("provenance: audio selection, studio edits, presets, and unmount invalidate pending API results", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = { crypto: webcrypto };
  try {
    for (const action of ["picker", "drop", "slider", "splits", "fingerprint", "subject", "preset", "unmount"]) {
      let resolveRequest;
      let calls = 0;
      globalThis.fetch = () => { calls++; return new Promise((resolve) => { resolveRequest = resolve; }); };
      const harness = componentHarness(components.ProvenanceCheckPage);
      try {
        harness.render();
        button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
        harness.render();
        const pending = submit(harness);
        harness.render();
        assert.equal(walk(harness.tree, (node) => node.type === "button" && node.props.type === "submit").props.disabled, true);
        if (action === "unmount") harness.unmount();
        else if (action === "preset") button(harness.tree, "Load Defective Music Provenance (Triggers HOLD)").props.onClick();
        else if (action === "picker" || action === "drop") {
          const bytes = new Uint8Array([1, 2, 3]);
          const file = { name: "local.wav", type: "audio/wav", size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
          if (action === "picker") await walk(expand(harness.tree), (node) => node.props.id === "provenance-audio-file").props.onChange({ target: { files: [file], value: file.name } });
          else await walk(expand(harness.tree), (node) => node.props["data-testid"] === "audio-dropzone").props.onDrop({ preventDefault() {}, dataTransfer: { files: [file] } });
        } else {
          const id = { slider: "provenance-split-artist", splits: "provenance-splits_bps", fingerprint: "provenance-audio_fingerprint_sha256", subject: "provenance-subject" }[action];
          walk(expand(harness.tree), (node) => node.props.id === id).props.onChange({ target: { value: action === "slider" ? "6000" : action === "splits" ? "5000, 5000" : action === "fingerprint" ? "e".repeat(64) : "EDIT-0003" } });
        }
        harness.render();
        const before = text(expand(harness.tree));
        resolveRequest({ ok: true, headers: { get: () => "application/json" }, json: async () => fixture("provenance") });
        await pending;
        harness.render();
        const layout = expand(harness.tree);
        assert.equal(text(layout), before, `Stale API response changed the page after ${action}`);
        assert.equal(text(layout).includes("GATE: PASS"), false);
        assert.equal(button(layout, "View full receipt →"), null);
        assert.equal(calls, 1);
      } finally {
        harness.unmount();
      }
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test("provenance: stale hash failures and invalid digest buffers cannot overwrite a newer selection", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  try {
    for (const stage of ["read", "digest", "invalid-digest"]) {
      const harness = componentHarness(components.ProvenanceCheckPage);
      let rejectOld;
      let digestStarted;
      const started = new Promise((resolve) => { digestStarted = resolve; });
      const oldBytes = new Uint8Array([3, 2, 1]).buffer;
      const newBytes = new Uint8Array([9, 8, 7]).buffer;
      globalThis.window = { crypto: { subtle: { digest(algorithm, buffer) {
        if (buffer === oldBytes) {
          digestStarted();
          return new Promise((resolve, reject) => { rejectOld = stage === "invalid-digest" ? () => resolve(new Uint8Array([1]).buffer) : () => reject(new Error("Old digest failed")); });
        }
        return webcrypto.subtle.digest(algorithm, buffer);
      } } } };
      try {
        harness.render();
        const oldFile = { name: "old.wav", type: "audio/wav", size: 3, arrayBuffer: stage === "read"
          ? () => new Promise((resolve, reject) => { rejectOld = () => reject(new Error("Old read failed")); })
          : async () => oldBytes };
        const pending = walk(expand(harness.tree), (node) => node.props.id === "provenance-audio-file").props.onChange({ target: { files: [oldFile], value: oldFile.name } });
        if (stage !== "read") await started;
        harness.render();
        const newFile = { name: "new.wav", type: "audio/wav", size: 3, arrayBuffer: async () => newBytes };
        await walk(expand(harness.tree), (node) => node.props.id === "provenance-audio-file").props.onChange({ target: { files: [newFile], value: newFile.name } });
        harness.render();
        const before = text(expand(harness.tree));
        rejectOld();
        await pending;
        harness.render();
        const layout = expand(harness.tree);
        assert.equal(text(layout), before);
        assert.equal(walk(layout, (node) => node.props.role === "alert"), null);
        assert.equal(walk(layout, (node) => node.props.id === "provenance-audio_fingerprint_sha256").props.value, createHash("sha256").update(new Uint8Array(newBytes)).digest("hex"));
        assert.equal(calls, 0);
      } finally {
        harness.unmount();
      }
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

for (const decision of ["PASS", "HOLD"]) {
  test(`provenance: prominent ${decision} outcome leads preview and full receipt with mapped reasons`, async () => {
    const originalFetch = globalThis.fetch;
    const expected = fixture("provenance", decision);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return { ok: true, headers: { get: () => "application/json" }, json: async () => expected };
    };
    const harness = componentHarness(components.ProvenanceCheckPage);
    const outcome = (layout) => walk(layout, (node) => node.props["data-testid"] === "verification-outcome");
    try {
      harness.render();
      assert.equal(outcome(expand(harness.tree)), null);
      button(harness.tree, `Load ${decision === "PASS" ? "Compliant" : "Defective"} Music Provenance (Triggers ${decision})`).props.onClick();
      harness.render();
      assert.equal(outcome(expand(harness.tree)), null);
      await submit(harness);
      harness.render();
      const expectedReasons = decision === "PASS" ? [
        "Reason: All provenance, rights-chain, and 10,000 bps split invariants satisfied",
      ] : [
        "Reason: Fingerprint Not Declared", "Reason: Recording ISRC Not Declared",
        "Reason: Missing Rights Chain", "Reason: Royalty Allocation Incomplete",
      ];
      for (const full of [false, true]) {
        const layout = expand(harness.tree);
        const card = outcome(layout);
        assert.ok(card);
        assert.equal(card.type, "section");
        assert.equal(card.props.role, "status");
        assert.equal(card.props["aria-live"], "polite");
        assert.match(card.props.className, /bg-ink/);
        assert.match(card.props.className, /text-white/);
        assert.match(card.props.className, decision === "HOLD" ? /border-amber-400/ : /border-emerald-400/);
        assert.equal(text(walk(card, (node) => node.type === "h2")), "VERIFICATION OUTCOME");
        const status = walk(card, (node) => node.type === "p" && text(node) === `Status: ${decision}`);
        assert.ok(status);
        assert.match(status.props.className, /text-3xl/);
        assert.match(status.props.className, /font-bold/);
        assert.match(status.props.className, decision === "HOLD" ? /bg-amber-400 text-amber-950/ : /bg-emerald-400 text-emerald-950/);
        const reasons = walk(card, (node) => node.type === "ul").props.children;
        assert.deepEqual(reasons.map(text), expectedReasons);
        assert.ok(text(card).includes("Receipt: Available"));
        assert.equal(text(card).includes(expected.receipt_id), full);
        const container = walk(layout, (node) => node.type === "div" && Array.isArray(node.props.children) && node.props.children[0] === card);
        assert.ok(container, "Outcome must be the first card in the current result step");
        assert.equal(calls, 1);
        if (!full) {
          button(harness.tree, "View full receipt →").props.onClick();
          harness.render();
        }
      }
      button(harness.tree, "← Back to preview").props.onClick();
      harness.render();
      assert.ok(outcome(expand(harness.tree)));
      button(harness.tree, "← Edit inputs").props.onClick();
      harness.render();
      assert.equal(outcome(expand(harness.tree)), null);
    } finally {
      harness.unmount();
      globalThis.fetch = originalFetch;
    }
  });
}

test("provenance: outcome reasons follow only returned violations and identify the actually missing provenance field", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [code, changes, expectedReasons] of [
      ["MISSING_PROVENANCE_HASH", { audio_fingerprint_sha256: "" }, ["Reason: Fingerprint Not Declared"]],
      ["MISSING_PROVENANCE_HASH", { isrc: "" }, ["Reason: Recording ISRC Not Declared"]],
      ["MISSING_PROVENANCE_HASH", {}, [`Reason: ${GATE_FINDING_REASONS.MISSING_PROVENANCE_HASH}`]],
      ["UNVERIFIED_RIGHTS_CHAIN", {}, ["Reason: Missing Rights Chain"]],
      ["SPLIT_CONSERVATION_VIOLATION", {}, ["Reason: Royalty Allocation Incomplete"]],
    ]) {
      globalThis.fetch = async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({
        ...fixture("provenance", "HOLD"), findings: [{ code, reason: GATE_FINDING_REASONS[code] }],
      }) });
      const harness = componentHarness(components.ProvenanceCheckPage);
      try {
        harness.render();
        button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
        harness.render();
        for (const [field, value] of Object.entries(changes)) {
          walk(expand(harness.tree), (node) => node.props.id === `provenance-${field}`).props.onChange({ target: { value } });
          harness.render();
        }
        await submit(harness);
        harness.render();
        const card = walk(expand(harness.tree), (node) => node.props["data-testid"] === "verification-outcome");
        assert.ok(text(card).includes("Status: HOLD"));
        assert.deepEqual(walk(card, (node) => node.type === "ul").props.children.map(text), expectedReasons);
      } finally {
        harness.unmount();
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provenance: failed or noncanonical responses never display a verification outcome or available receipt", async () => {
  const originalFetch = globalThis.fetch;
  const harness = componentHarness(components.ProvenanceCheckPage);
  try {
    harness.render();
    button(harness.tree, "Load Compliant Music Provenance (Triggers PASS)").props.onClick();
    harness.render();
    for (const responder of [
      async () => { throw new Error("Offline"); },
      async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ ...fixture("provenance"), receipt_id: "invalid" }) }),
    ]) {
      globalThis.fetch = responder;
      await submit(harness);
      harness.render();
      const layout = expand(harness.tree);
      assert.equal(walk(layout, (node) => node.props["data-testid"] === "verification-outcome"), null);
      assert.equal(text(layout).includes("Receipt: Available"), false);
      assert.equal(text(layout).includes("Status: PASS"), false);
    }
  } finally {
    harness.unmount();
    globalThis.fetch = originalFetch;
  }
});
