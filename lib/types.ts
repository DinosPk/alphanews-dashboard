// Κοινοί τύποι δεδομένων μεταξύ backend (API routes) και frontend.

export type RangeKey = "24h" | "7d" | "30d";

export interface PageRow {
  /** Τίτλος σελίδας/άρθρου */
  title: string;
  /** Διαδρομή URL (path) — άδειο στο real-time */
  path?: string;
  /** Ενεργοί χρήστες ή προβολές, ανάλογα με το context */
  value: number;
}

export interface ChannelRow {
  /** Όνομα πηγής/καναλιού (π.χ. Organic Search, Social, Direct) */
  channel: string;
  /** Συνεδρίες (sessions) */
  sessions: number;
  /** Ποσοστό επί του συνόλου (0-100) */
  share: number;
}

export interface TimePoint {
  /** Ετικέτα άξονα Χ (ώρα ή ημερομηνία) */
  label: string;
  /** Προβολές σελίδων (τρέχουσα περίοδος) */
  pageViews: number;
  /** Ενεργοί χρήστες */
  users: number;
  /** Προβολές της ΠΡΟΗΓΟΥΜΕΝΗΣ περιόδου (ίδια θέση) — για σύγκριση */
  prevPageViews?: number;
}

/** Απάντηση του /api/realtime (ειδήσεις «σήμερα», ανανέωση κάθε 30") */
export interface RealtimeData {
  /** Top άρθρα ειδήσεων σήμερα (προβολές) */
  topPages: PageRow[];
  /** Κατανομή ανά συσκευή */
  byDevice: { device: string; users: number }[];
  /** Κατανομή ανά χώρα (top) */
  byCountry: { country: string; users: number }[];
  /** true αν τα δεδομένα είναι ψεύτικα (demo mode) */
  demo: boolean;
  /** ISO timestamp παραγωγής */
  generatedAt: string;
}

export interface KpiValue {
  current: number;
  previous: number;
  /** Ποσοστιαία μεταβολή vs προηγούμενη περίοδος (μπορεί να είναι null) */
  changePct: number | null;
}

/** Απάντηση του /api/historical */
export interface HistoricalData {
  range: RangeKey;
  kpis: {
    pageViews: KpiValue;
    activeUsers: KpiValue;
    sessions: KpiValue;
    /** Μέση διάρκεια συνεδρίας σε δευτερόλεπτα */
    avgSessionDuration: KpiValue;
    /** Ποσοστό εμπλοκής (engagement rate) 0-100 */
    engagementRate: KpiValue;
  };
  timeseries: TimePoint[];
  topArticles: PageRow[];
  channels: ChannelRow[];
  demo: boolean;
  generatedAt: string;
}
