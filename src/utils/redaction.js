// src/utils/redaction.js
// Local, client-side masking of sensitive identifiers. Account numbers
// are redacted *before* they are displayed or submitted to the backend —
// the raw value never leaves the browser.

export function maskAccountNumber(value) {
  const v = String(value || "").replace(/\s+/g, "");
  if (!v) return "";
  if (v.length <= 4) return "*".repeat(v.length);
  return "*".repeat(v.length - 4) + v.slice(-4);
}

export function maskEmail(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const at = v.indexOf("@");
  if (at <= 0) return "***";
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

export function maskSsnLast4(value) {
  const v = String(value || "").trim();
  return v ? `***-**-${v}` : "";
}
