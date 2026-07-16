// Ενότητες του alphatv.gr για φιλτράρισμα ιστορικών στοιχείων.
//
// ΚΑΝΟΝΑΣ SCOPE (καθολικός):
//   Μετράμε ΟΤΙΔΗΠΟΤΕ βρίσκεται στο /news/ και ΟΤΙΔΗΠΟΤΕ από κάτω του.
//   Πραγματική δομή URL: /news/{κατηγορία}/article/{id}/{slug}/
//   π.χ. /news/kosmos/article/220742/sudrivi-an-26-stin-krimaia/
//
// Ό,τι δεν είναι κάτω από /news/ (αρχική, σειρές, εκπομπές, live, webtv)
// ΔΕΝ μετράει.

export interface Section {
  /** Μοναδικό id (πάει στο API ως ?section=...) */
  key: string;
  /** Ετικέτα στο UI */
  label: string;
  /** Πρόθεμα του URL path (BEGINS_WITH) — πάντα κάτω από /news/ */
  pathContains: string;
}

/** Ρίζα του ειδησεογραφικού scope. Με trailing slash ώστε να ΜΗΝ πιάνει /newscast/. */
export const NEWS_ROOT = "/news/";

export const SECTIONS: Section[] = [
  { key: "koinonia", label: "Κοινωνία", pathContains: "/news/koinonia/" },
  { key: "politika", label: "Πολιτική", pathContains: "/news/politika/" },
  { key: "kosmos", label: "Διεθνή", pathContains: "/news/kosmos/" },
  { key: "deltia", label: "Δελτία ειδήσεων", pathContains: "/news/deltia/" },
  { key: "oikonomia", label: "Οικονομία", pathContains: "/news/oikonomia/" },
  { key: "ugeia", label: "Υγεία", pathContains: "/news/ugeia/" },
  { key: "athlitika", label: "Αθλητικά", pathContains: "/news/athlitika/" },
  { key: "politismos", label: "Πολιτισμός", pathContains: "/news/politismos/" },
  { key: "kairos", label: "Καιρός", pathContains: "/news/kairos/" },
  { key: "video-moments", label: "Video Moments", pathContains: "/news/video-moments/" },
  { key: "tech", label: "Τεχνολογία", pathContains: "/news/tech/" },
];

export function findSection(key: string | null | undefined): Section | null {
  if (!key || key === "all") return null;
  return SECTIONS.find((s) => s.key === key) ?? null;
}

// Διατηρείται για συμβατότητα: το καθολικό scope είναι πλέον ΕΝΑΣ κανόνας.
export const NEWS_PATHS: string[] = [NEWS_ROOT];

// Τίτλοι σελίδων που ΕΞΑΙΡΟΥΝΤΑΙ στο real-time (entertainment).
export const REALTIME_EXCLUDE_TITLE =
  /ΕΠΕΙΣΟΔΙΟ|\bΣ\d+\s*-|^Σειρά|Σειρές|Εκπομπ|Live Streaming|Live TV|Πρόγραμμα\s*\||^AlphaTV\s*\|/i;
