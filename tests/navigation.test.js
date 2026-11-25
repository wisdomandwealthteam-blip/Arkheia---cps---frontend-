import test from "node:test";
import assert from "node:assert/strict";
import { captureGovernancePilot, syncTabHistory, tabFromLocation, tabUrl } from "../src/utils/navigation.js";
import { mockBrowser } from "./helpers/componentHarness.js";

function clickEvent(href, options = {}) {
  const anchor = { getAttribute: () => href };
  return {
    button: 0, defaultPrevented: false,
    target: { closest: () => anchor },
    currentTarget: { contains: () => true },
    preventDefault() { this.defaultPrevented = true; },
    ...options,
  };
}

test("only GovernanceCheck pilot mailto is captured, including nested anchor targets", () => {
  const event = clickEvent("mailto:admin@aspectsmediagroup.com?subject=GovernanceCheck%20Pilot");
  const tabs = [];
  assert.equal(captureGovernancePilot(event, (tab) => tabs.push(tab)), true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(tabs, ["governance"]);
});

test("all other product pilots, ordinary mailto, and external URLs remain untouched", () => {
  for (const href of [
    "mailto:admin@aspectsmediagroup.com?subject=SettlementCheck%20Pilot",
    "mailto:admin@aspectsmediagroup.com?subject=ProvenanceCheck%20Pilot",
    "mailto:admin@aspectsmediagroup.com?subject=EdgeVerify%20Pilot",
    "mailto:admin@aspectsmediagroup.com?subject=ARKHEIA%20DVE%20Pilot%20Request",
    "mailto:someone@example.test?subject=GovernanceCheck%20Pilot",
    "https://example.test/?subject=GovernanceCheck%20Pilot", "#clearcheck-module", "invalid",
  ]) {
    const event = clickEvent(href);
    assert.equal(captureGovernancePilot(event, () => assert.fail("Unexpected navigation")), false);
    assert.equal(event.defaultPrevented, false);
  }
});

test("capture stays scoped to its host and ignores non-anchor and modified clicks", () => {
  for (const options of [
    { currentTarget: { contains: () => false } }, { target: {} }, { target: null },
    { button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
    { defaultPrevented: true },
  ]) {
    assert.equal(captureGovernancePilot(clickEvent("mailto:admin@aspectsmediagroup.com?subject=GovernanceCheck%20Pilot", options), () => assert.fail("Unexpected navigation")), false);
  }
});

test("direct governance path and tab queries resolve to the correct tab", () => {
  for (const path of ["/governance", "/governance/", "/?tab=governance"]) assert.equal(tabFromLocation(new URL(path, "https://test")), "governance");
  for (const tab of ["home", "auto", "housing", "clearcheck", "dashboard", "billing", "developer"]) assert.equal(tabFromLocation(new URL(`/?tab=${tab}`, "https://test")), tab);
  assert.equal(tabFromLocation(new URL("/?tab=unknown", "https://test")), "home");
});

test("existing trial/check/checkout return precedence is preserved", () => {
  for (const [query, tab] of [
    ["trial=active&session_id=cs_example&tab=governance", "billing"], ["trial=canceled", "billing"],
    ["check_id=chk_example&checkout=success", "clearcheck"], ["checkout=success", "billing"],
    ["checkout=cancelled", "billing"], ["tab=billing", "billing"], ["tab=clearcheck", "clearcheck"],
  ]) assert.equal(tabFromLocation(new URL(`/?${query}`, "https://test")), tab);
});

test("navigation preserves unrelated query/hash and returns from governance to root", () => {
  const location = new URL("/governance?campaign=one#details", "https://test");
  assert.equal(tabUrl(location, "home"), "/?campaign=one#details");
  assert.equal(tabUrl(location, "auto"), "/?campaign=one&tab=auto#details");
  assert.equal(tabUrl(location, "governance"), "/governance?campaign=one#details");
  assert.throws(() => tabUrl(location, "invalid"));
});

test("history pushes once per route and back/forward restores the tab without duplicates", () => {
  const browser = mockBrowser("/?campaign=one#details");
  syncTabHistory(browser, "home", true);
  syncTabHistory(browser, "governance");
  assert.equal(browser.location.pathname, "/governance");
  syncTabHistory(browser, "governance");
  assert.equal(browser.history.length, 2);
  syncTabHistory(browser, "billing");
  assert.equal(browser.location.search, "?campaign=one&tab=billing");
  browser.history.back();
  assert.equal(tabFromLocation(browser.location), "governance");
  browser.history.back();
  assert.equal(tabFromLocation(browser.location), "home");
  browser.history.forward();
  assert.equal(tabFromLocation(browser.location), "governance");
  browser.history.forward();
  assert.equal(tabFromLocation(browser.location), "billing");
  assert.equal(browser.history.length, 3);
});
