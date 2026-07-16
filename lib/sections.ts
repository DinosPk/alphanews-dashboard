// Ενότητες ειδήσεων του alphatv.gr.
//
// ΕΠΑΛΗΘΕΥΜΕΝΟ από GA4 export (Pages and screens, 9-15/7/2026):
// Τα άρθρα ζουν σε top-level paths ανά κατηγορία:
//   /koinonia/{slug}/   π.χ. /koinonia/dolofoniki-epithesi-stin-kriti.../  (2.276 views)
//   /kosmos/{slug}/, /politika/{slug}/, ...
// Το /news/ είναι ΜΟΝΟ η σελίδα-ροή (hub), δεν κρέμονται άρθρα από κάτω.
// Το /articles/ υπάρχει αλλά είναι αμελητέο (102 views / 14 σελίδες).
//
// Ό,τι δεν είναι εδώ (/series, /live, /, /programma, /show, /movies)
// είναι ψυχαγωγία και ΔΕΝ μετράει — είναι το 99% του site.

export interface Section {
  key: string;
  label: string;
  /** Πρόθεμα URL path (BEGINS_WITH) */
  pathContains: string;
}

export const SECTIONS: Section[] = [
  { key: "koinonia", label: "Κοινωνία", pathContains: "/koinonia/" },
  { key: "newscast", label: "Δελτία ειδήσεων", pathContains: "/newscast/alpha-news" },
  { key: "kosmos", label: "Διεθνή", pathContains: "/kosmos/" },
  { key: "politika", label: "Πολιτική", pathContains: "/politika/" },
  { key: "athlitika", label: "Αθλητικά", pathContains: "/athlitika/" },
  { key: "oikonomia", label: "Οικονομία", pathContains: "/oikonomia/" },
  { key: "politismos", label: "Πολιτισμός", pathContains: "/politismos/" },
  { key: "ugeia", label: "Υγεία", pathContains: "/ugeia/" },
  { key: "tech", label: "Τεχνολογία", pathContains: "/tech/" },
];

/** Καθολικό news scope. Όλα επαληθευμένα από το GA4 export. */
export const NEWS_PATHS: string[] = [
  "/news/",                 // η σελίδα-ροή
  "/koinonia/",
  "/newscast/alpha-news",   // σελίδα εκπομπής + broadcasts
  "/kosmos/",
  "/politika/",
  "/athlitika/",
  "/oikonomia/",
  "/politismos/",
  "/ugeia/",
  "/tech/",
  "/articles/",             // legacy, ελάχιστη κίνηση
  "/video-moments/",
];

export function findSection(key: string | null | undefined): Section | null {
  if (!key || key === "all") return null;
  return SECTIONS.find((s) => s.key === key) ?? null;
}

export const REALTIME_EXCLUDE_TITLE =
  /ΕΠΕΙΣΟΔΙΟ|\bΣ\d+\s*-|^Σειρά|Σειρές|Εκπομπ|Live Streaming|Live TV|Πρόγραμμα\s*\||^AlphaTV\s*\|/i;
