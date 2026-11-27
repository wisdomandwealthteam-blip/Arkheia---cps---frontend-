// src/utils/navigation.js
const TAB_IDS = ["home", "auto", "housing", "clearcheck", "governance", "dashboard", "billing", "developer"];
const GATE_PATHS = {
  settlement: "/settlement", provenance: "/provenance", custody: "/custody", edge: "/edge",
};
const GATE_ALIASES = { musicguard: "provenance", custos: "custody" };
TAB_IDS.push(...Object.keys(GATE_PATHS));

function gateTab(pathname) {
  const route = pathname.replace(/^\//, "").replace(/\/$/, "");
  return Object.hasOwn(GATE_PATHS, route) ? route
    : Object.hasOwn(GATE_ALIASES, route) ? GATE_ALIASES[route] : undefined;
}

export function tabFromLocation(location) {
  const params = new URLSearchParams(location.search);
  // Preserve precedence of existing Stripe/trial return handling in App.
  if (["active", "canceled"].includes(params.get("trial"))) return "billing";
  if (params.get("check_id")) return "clearcheck";
  if (["success", "cancelled"].includes(params.get("checkout"))) return "billing";
  const queryTab = params.get("tab");
  if (TAB_IDS.includes(queryTab)) return queryTab;
  const gate = gateTab(location.pathname);
  if (gate) return gate;
  return /^\/governance\/?$/.test(location.pathname) ? "governance" : "home";
}

export function tabUrl(location, tab) {
  if (!TAB_IDS.includes(tab)) throw new Error("Unknown application tab.");
  if (Object.hasOwn(GATE_PATHS, tab) || gateTab(location.pathname)) {
    const params = new URLSearchParams(location.search);
    params.delete("tab");
    if (!Object.hasOwn(GATE_PATHS, tab) && tab !== "home" && tab !== "governance") params.set("tab", tab);
    const path = GATE_PATHS[tab] || (tab === "governance" ? "/governance" : "/");
    const search = params.toString();
    return `${path}${search ? `?${search}` : ""}${location.hash || ""}`;
  }
  const params = new URLSearchParams(location.search);
  params.delete("tab");
  if (tab !== "home" && tab !== "governance") params.set("tab", tab);
  const path = tab === "governance" ? "/governance"
    : /^\/governance\/?$/.test(location.pathname) ? "/" : location.pathname;
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}${location.hash || ""}`;
}

export function syncTabHistory(browser, tab, replace = false) {
  const url = tabUrl(browser.location, tab);
  const current = `${browser.location.pathname}${browser.location.search}${browser.location.hash || ""}`;
  if (url === current && !replace) return;
  browser.history[replace ? "replaceState" : "pushState"](
    { ...browser.history.state, arkheiaTab: tab }, "", url
  );
}

export function captureGovernancePilot(event, navigate) {
  if (event.defaultPrevented || event.button > 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = event.target?.closest?.("a[href]");
  if (!anchor || !event.currentTarget.contains(anchor)) return false;
  let url;
  try {
    url = new URL(anchor.getAttribute("href"));
  } catch {
    return false;
  }
  if (url.protocol !== "mailto:" || url.pathname !== "admin@aspectsmediagroup.com" ||
      url.searchParams.get("subject") !== "GovernanceCheck Pilot") return false;
  event.preventDefault();
  navigate("governance");
  return true;
}
