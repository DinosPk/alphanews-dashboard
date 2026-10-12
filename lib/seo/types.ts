// Τύποι του SEO Tags module.

export interface WpTag {
  id: number;
  name: string;
  slug: string;
  /** Πλήθος άρθρων με αυτό το tag (null όταν τα tags ήρθαν από το sitemap) */
  count: number | null;
  /** Path της σελίδας tag, π.χ. /tag/fotia/ */
  path: string;
  /** Ημερομηνία τελευταίου άρθρου (από το sitemap) */
  lastmod?: string;
}

/** Απόδοση σελίδας tag στο Google Search (GSC) + GA4 */
export interface TagPerf {
  clicks: number;
  impressions: number;
  position: number | null;
  /** Προβολές σελίδας tag στο GA4 */
  views: number;
}

export type TagAction = "merge" | "noindex" | "hub" | "fix-case" | "keep";

export interface AuditTag extends WpTag {
  perf: TagPerf;
  /** Ζήτηση: άθροισμα impressions των GSC queries που περιέχουν το tag */
  demand: number;
  action: TagAction;
  reason: string;
  /** Για merge: σε ποιο tag να συγχωνευτεί */
  mergeInto?: { id: number; name: string; path: string };
}

export interface DuplicateGroup {
  /**
   * exact  = ίδιο μετά από πεζά/τόνους → συγχώνευση
   * fuzzy  = πιθανό (greeklish/πτώσεις/πληθυντικός) → συγχώνευση μετά από έλεγχο
   * subset = σύντομη μορφή ενός πιο πλήρους tag («Σαμαράς» ⊂ «Αντώνης Σαμαράς») → μόνο έλεγχος
   */
  kind: "exact" | "fuzzy" | "subset";
  canonical: WpTag;
  members: WpTag[];
}

export interface AuditData {
  totals: {
    tags: number;
    orphans: number | null; // 0-1 άρθρα (null: άγνωστο χωρίς το WordPress API)
    thin: number; // 2-4 άρθρα & χωρίς κίνηση
    duplicateGroups: number;
    capsInconsistent: number; // ΟΛΟ ΚΕΦΑΛΑΙΑ
    hubs: number;
  };
  duplicates: DuplicateGroup[];
  tags: AuditTag[];
  sources: SourceStatus;
  demo: boolean;
  generatedAt: string;
}

export interface GapRow {
  /** Ο όρος (n-gram από τα GSC queries) */
  term: string;
  impressions: number;
  clicks: number;
  /** Πόσα διαφορετικά queries περιέχουν τον όρο */
  queries: number;
  /** Παραδείγματα queries */
  examples: string[];
}

export interface GapData {
  rows: GapRow[];
  /** Tags με τη μεγαλύτερη ζήτηση — υποψήφια topic hubs */
  topTags: { name: string; path: string; count: number | null; demand: number }[];
  period: { start: string; end: string };
  sources: SourceStatus;
  demo: boolean;
  generatedAt: string;
}

export interface SuggestedTag {
  name: string;
  /** Υπάρχον tag ή νέο */
  existing: boolean;
  id?: number;
  path?: string;
  count?: number | null;
  score: number;
  /** Πού βρέθηκε (τίτλος / κείμενο) */
  where: ("title" | "body")[];
  /** Ζήτηση στο GSC (impressions) */
  demand: number;
  /** Ταιριάζει με τρέχον Google Trend */
  trending?: boolean;
  /** Πιθανό διπλότυπο υπάρχοντος tag (για νέα tags) */
  similarTo?: string;
}

export interface SuggestData {
  title: string;
  existing: SuggestedTag[];
  newTags: SuggestedTag[];
  /** Tags που έχει ήδη το άρθρο (αν δόθηκε URL) */
  current?: string[];
  sources: SourceStatus;
  demo: boolean;
}

export interface TrendItem {
  title: string;
  traffic: string;
  /** Αριθμητική εκτίμηση (π.χ. 500+ → 500) για ταξινόμηση */
  trafficNum: number;
  pubDate: string;
  news: { title: string; url: string; source: string }[];
  matchedTag?: { name: string; path: string; count: number | null; kind: "exact" | "fuzzy" | "partial" };
}

export interface TrendingData {
  items: TrendItem[];
  sources: SourceStatus;
  demo: boolean;
  generatedAt: string;
}

export interface SourceStatus {
  /** ok = REST API (με πλήθος άρθρων), sitemap = δημόσιο sitemap του Yoast (χωρίς πλήθος) */
  wordpress: "ok" | "sitemap" | "error" | "demo";
  gsc: "ok" | "error" | "not-configured" | "demo";
  ga4: "ok" | "error" | "not-configured" | "demo";
  trends?: "ok" | "error" | "demo";
  /** Μήνυμα σφάλματος (σύντομο) ανά πηγή */
  errors?: Partial<Record<"wordpress" | "gsc" | "ga4" | "trends", string>>;
}
