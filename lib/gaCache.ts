// Cache για τα αποτελέσματα του GA4.
//
// Γιατί: το GA4 Data API έχει ωριαίο όριο «tokens» ανά property, ΚΟΙΝΟ για το
// alphanews-dashboard και το alphatv-dashboard. Χωρίς cache, κάθε ανοιχτό tab
// ξαναρωτάει το GA4 σε κάθε ανανέωση και το όριο εξαντλείται → DEMO δεδομένα.
//
// Πώς:
// 1. `unstable_cache` (Next.js Data Cache): στο Vercel είναι ΚΟΙΝΟ για όλα τα
//    serverless instances. Ίδιο ερώτημα μέσα στο TTL → καμία κλήση στο GA4.
//    Μετά το TTL σερβίρει το παλιό και ανανεώνει στο παρασκήνιο.
// 2. Αποτελέσματα DEMO (fallback μετά από σφάλμα GA4) ΔΕΝ μπαίνουν στο cache.
// 3. Αν το GA4 αποτύχει, γυρνάμε το τελευταίο ΠΡΑΓΜΑΤΙΚΟ αποτέλεσμα αυτού του
//    instance (αν υπάρχει) αντί για DEMO.

import { unstable_cache } from "next/cache";
import { isConfigured } from "./ga4";

const lastGood = new Map<string, unknown>();

class DemoResult extends Error {
  constructor(public result: unknown) {
    super("GA4 fallback σε demo");
  }
}

export async function cachedGA4<T extends { demo: boolean }>(
  key: string[],
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const k = key.join("|");
  const live = isConfigured();
  try {
    const res = await unstable_cache(
      async () => {
        const r = await fetcher();
        // Με credentials, demo = σφάλμα GA4 (π.χ. quota). Μην το κρατήσεις.
        if (live && r.demo) throw new DemoResult(r);
        return r;
      },
      ["ga4", ...key],
      { revalidate: ttlSeconds, tags: ["ga4"] }
    )();
    lastGood.set(k, res);
    return res;
  } catch (err) {
    const prev = lastGood.get(k) as T | undefined;
    if (prev) return prev;
    if (err instanceof DemoResult) return err.result as T;
    throw err;
  }
}

/**
 * TTL (δευτερόλεπτα) ανά τύπο δεδομένων. Το cache είναι ΚΟΙΝΟ για όλους τους
 * θεατές, οπότε το κόστος σε GA4 tokens δεν αυξάνεται με τα ανοιχτά tabs.
 * Μετρημένο κόστος (alphatv, όλο το site): ~90-100 tokens ανά ανανέωση
 * realtime / 24ωρου / εβδομάδας. Όριο: ~14.000 tokens/ώρα, κοινό και για τα
 * δύο dashboards. Με αυτά τα TTL η βασική κατανάλωση είναι ~2-3χ/ώρα.
 */
export const TTL = {
  /** Top σελίδες/συσκευές/χώρες — το GA4 τα ενημερώνει ανά ώρα */
  realtime: 300,
  /** Ενεργοί χρήστες τώρα — Realtime API, ξεχωριστό quota */
  activeNow: 60,
  /** Κυλιόμενο 24ωρο (ωριαία δεδομένα) */
  rolling24h: 600,
  /** Εβδομάδα / Μήνας / Διάστημα — έως χθες, αλλάζουν ελάχιστα */
  historical: 3600,
  /** Μηνιαία */
  monthly: 3600,
};
