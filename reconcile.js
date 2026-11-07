// Payment reconciliation.
//
// Reads payments.jsonl and works out how much money we actually collected.
// Run:  node reconcile.js
//
// Rules (from the README):
//   * Ignore lines that cannot be read, and events without a txn_id.
//   * A payment can be attempted more than once (same txn_id). Only the latest
//     attempt (by timestamp, not by position in the file) counts.
//   * A payment is collected only if its latest attempt is "success".

const fs = require("fs");

// Naira amount -> whole kobo (integer), so there is no floating-point drift.
// Amounts arrive as numbers (3533.05) or as text with thousands separators
// ("55,707.77"), so strip the commas before converting.
function toKobo(value) {
  const text = String(value).replace(/,/g, "").trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (m) return Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
  return Math.round(Number(text) * 100);
}

const latest = new Map(); // txn_id -> { ts, event }: only the newest attempt is kept
let unreadable = 0;
let noTxnId = 0;

const lines = fs.readFileSync("payments.jsonl", "utf8").split("\n");
for (const raw of lines) {
  const line = raw.trim();
  if (line.length === 0) continue;
  let event;
  try {
    event = JSON.parse(line);
  } catch (err) {
    unreadable += 1; // truncated or corrupt line
    continue;
  }
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    unreadable += 1;
    continue;
  }
  if (!event.txn_id) {
    noTxnId += 1;
    continue;
  }
  const ts = Date.parse(event.ts);
  const seen = latest.get(event.txn_id);
  // Keep the latest attempt. On an exact tie, the later line wins.
  if (!seen || ts >= seen.ts) latest.set(event.txn_id, { ts, event });
}

let count = 0;
let totalKobo = 0;
for (const { event } of latest.values()) {
  if (event.status === "success") {
    count += 1;
    totalKobo += toKobo(event.amount);
  }
}
const total = Math.floor((totalKobo + 50) / 100); // whole naira, halves round up

const expected = parseInt(fs.readFileSync("expected.txt", "utf8").trim(), 10);

console.log(`Skipped ${unreadable} unreadable lines and ${noTxnId} events without a txn_id.`);
if (count !== expected) {
  console.log(`Check failed: counted ${count} successful payments, expected ${expected}.`);
  console.log("Something in the data isn't being handled the way the README describes.");
} else {
  console.log(`Check passed: ${count} successful payments.`);
  console.log(`Your code: KOYA-${total}`);
}
