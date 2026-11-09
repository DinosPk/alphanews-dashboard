// Φύλακας quota του GA4: οι κλήσεις ΣΤΑΜΑΤΟΥΝ πριν φτάσουμε στα όρια.
//
// Το GA4 Data API δεν χρεώνει — όταν ξεπεραστεί το όριο απλώς αρνείται να
// απαντήσει (RESOURCE_EXHAUSTED) και τα dashboards πέφτουν σε DEMO. Τα όρια
// (standard property) είναι ΚΟΙΝΑ για alphanews-dashboard και alphatv-dashboard
// (ίδιο property, ίδιο Google Cloud project):
//   tokensPerProjectPerHour 14.000 · tokensPerHour 40.000 · tokensPerDay 200.000
//   concurrentRequests 10
// (ίδια, ξεχωριστά, για το Realtime API).
//
// Πώς:
// - Κάθε κλήση ζητά `returnPropertyQuota` → το GA4 μάς λέει πόσα tokens
//   απομένουν. Αν κάποιο όριο πέσει κάτω από το ΑΠΟΘΕΜΑ, νέες κλήσεις
//   μπλοκάρονται (QuotaGuardError) και τα dashboards σερβίρουν το cache.
// - Μετά από 15' χωρίς νέα μέτρηση αφήνουμε μία κλήση να περάσει
//   για να ξαναμετρήσουμε (το ωριαίο όριο αναπληρώνεται).
// - RESOURCE_EXHAUSTED → μπλοκ για 15' (όχι σφυροκόπημα).
// - Το πολύ 3 ταυτόχρονες κλήσεις ανά instance (όριο GA4: 10 συνολικά).
//
// ΑΠΟΘΕΜΑ: το alphanews-dashboard κρατά ΜΙΚΡΟ απόθεμα: έχει προτεραιότητα. Το alphatv-dashboard
// σταματά πολύ νωρίτερα (απόθεμα 6.000/ώρα) για να του αφήνει χώρο.

import type { BetaAnalyticsDataClient } from "@google-analytics/data";

type Kind = "data" | "realtime";

/** Κάτω από αυτά τα υπόλοιπα tokens, ΔΕΝ κάνουμε νέες κλήσεις. */
const RESERVE = {
  projectHour: 2000,
  hour: 6000,
  day: 25000,
};
const STALE_MS = 15 * 60_000;
const MAX_CONCURRENT = 3;

interface QuotaState {
  projectHour: number;
  hour: number;
  day: number;
  at: number;
}
const state: Record<Kind, QuotaState | null> = { data: null, realtime: null };

export class QuotaGuardError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "QuotaGuardError";
  }
}

/** Τρέχουσα εικόνα (για διάγνωση / /api/quota). */
export function quotaSnapshot() {
  return { reserve: RESERVE, state, inFlight };
}

function check(kind: Kind) {
  const s = state[kind];
  if (!s || Date.now() - s.at > STALE_MS) return; // άγνωστο/παλιό → ξαναμέτρα
  const low: string[] = [];
  if (s.projectHour < RESERVE.projectHour) low.push(`project/ώρα ${s.projectHour}`);
  if (s.hour < RESERVE.hour) low.push(`ώρα ${s.hour}`);
  if (s.day < RESERVE.day) low.push(`ημέρα ${s.day}`);
  if (low.length) {
    throw new QuotaGuardError(
      `GA4 ${kind}: χαμηλό υπόλοιπο quota (${low.join(", ")}) — εξοικονόμηση`
    );
  }
}

type QuotaField = { remaining?: number | null } | null | undefined;
type PropertyQuota = {
  tokensPerProjectPerHour?: QuotaField;
  tokensPerHour?: QuotaField;
  tokensPerDay?: QuotaField;
} | null | undefined;

function record(kind: Kind, q: PropertyQuota) {
  if (!q) return;
  const v = (f: QuotaField, fallback: number) =>
    typeof f?.remaining === "number" ? f.remaining : fallback;
  state[kind] = {
    projectHour: v(q.tokensPerProjectPerHour, Infinity),
    hour: v(q.tokensPerHour, Infinity),
    day: v(q.tokensPerDay, Infinity),
    at: Date.now(),
  };
}

// --- απλός σηματοφόρος για ταυτόχρονες κλήσεις ---
let inFlight = 0;
const waiters: (() => void)[] = [];
async function acquire() {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
  inFlight++;
}
function release() {
  inFlight--;
  waiters.shift()?.();
}

/** Τυλίγει τον client: κάθε runReport / runRealtimeReport περνά από τον φύλακα. */
export function guardClient(client: BetaAnalyticsDataClient): BetaAnalyticsDataClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "runReport" || prop === "runRealtimeReport") {
        const kind: Kind = prop === "runReport" ? "data" : "realtime";
        const fn = Reflect.get(target, prop, receiver) as (
          ...a: unknown[]
        ) => Promise<[{ propertyQuota?: PropertyQuota }, ...unknown[]]>;
        return async (req: Record<string, unknown>, ...rest: unknown[]) => {
          check(kind);
          await acquire();
          try {
            const res = await fn.call(
              target,
              { ...req, returnPropertyQuota: true },
              ...rest
            );
            record(kind, res?.[0]?.propertyQuota);
            return res;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/RESOURCE_EXHAUSTED|Exhausted/i.test(msg)) {
              // Εξαντλήθηκε → μπλοκ μέχρι την επόμενη μέτρηση.
              state[kind] = { projectHour: 0, hour: 0, day: 0, at: Date.now() };
            }
            throw err;
          } finally {
            release();
          }
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
