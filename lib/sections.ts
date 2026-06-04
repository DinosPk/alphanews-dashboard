// Ενότητες του alphatv.gr για φιλτράρισμα ιστορικών στοιχείων.
//
// Τα "pathContains" αντιστοιχούν στα πραγματικά URL slugs του alphatv.gr.
// Αν προστεθεί/αλλάξει κατηγορία, επεξεργάσου απλώς αυτή τη λίστα.

export interface Section {
  /** Μοναδικό id (πάει στο API ως ?section=...) */
  key: string;
  /** Ετικέτα στο UI */
  label: string;
  /** Κομμάτι του URL path που χαρακτηρίζει την ενότητα (CONTAINS, case-insensitive) */
  pathContains: string;
}

export const SECTIONS: Section[] = [
  { key: "koinonia", label: "Κοινωνία", pathContains: "/koinonia/" },
  { key: "politika", label: "Πολιτική", pathContains: "/politika/" },
  { key: "kosmos", label: "Κόσμος", pathContains: "/kosmos/" },
  { key: "ugeia", label: "Υγεία", pathContains: "/ugeia/" },
  { key: "oikonomia", label: "Οικονομία", pathContains: "/oikonomia/" },
  { key: "athlitika", label: "Αθλητικά", pathContains: "/athlitika/" },
  { key: "politismos", label: "Πολιτισμός", pathContains: "/politismos/" },
  { key: "tech", label: "Τεχνολογία", pathContains: "/tech/" },
  { key: "video-moments", label: "Video Moments", pathContains: "/video-moments/" },
  { key: "newscast", label: "Δελτία ειδήσεων", pathContains: "/newscast/alpha-news" },
];

export function findSection(key: string | null | undefined): Section | null {
  if (!key || key === "all") return null;
  return SECTIONS.find((s) => s.key === key) ?? null;
}

// Το συνολικό «alphanews» scope: όλα τα ειδησεογραφικά paths (κατηγορίες + /news/).
// Χρησιμοποιείται ως καθολικό φίλτρο ώστε το dashboard να ΜΗΝ μετράει
// σειρές/live/ψυχαγωγία — μόνο ειδήσεις.
export const NEWS_PATHS: string[] = [
  "/news/",
  ...SECTIONS.map((s) => s.pathContains),
];

// Τίτλοι σελίδων που ΕΞΑΙΡΟΥΝΤΑΙ στο real-time (entertainment) — το real-time
// API δεν φιλτράρει κατά path, οπότε καθαρίζουμε με βάση τον τίτλο.
// Πιάνει: επεισόδια (ΕΠΕΙΣΟΔΙΟ / "Σ1 -"), σειρές, εκπομπές, live, αρχική.
export const REALTIME_EXCLUDE_TITLE =
  /ΕΠΕΙΣΟΔΙΟ|\bΣ\d+\s*-|^Σειρά|Σειρές|Εκπομπ|Live Streaming|Live TV|Πρόγραμμα\s*\||^AlphaTV\s*\|/i;
