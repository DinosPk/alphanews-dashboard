// Η ημερήσια αναφορά: πόσα άρθρα δημοσίευσε κάθε συντάκτης το προηγούμενο
// 24ωρο (00:00–23:59 ώρα Ελλάδας) — και γράψιμο στο Google Sheet.
//
// Το Sheet έχει δύο tabs:
//
//   «Καταμέτρηση»  Στήλη A = όνομα συντάκτη, μία στήλη ανά ημέρα (η πιο
//                  πρόσφατη πάντα στη στήλη B). Τελευταία γραμμή = ΣΥΝΟΛΟ.
//   «Αναλυτικά»    Ένα άρθρο ανά γραμμή (ημερομηνία, ώρα, συντάκτης, τίτλος,
//                  ενότητα, URL) — η βάση για ό,τι χτίσουμε στο επόμενο βήμα.
//
// Η εγγραφή είναι idempotent: αν ξανατρέξει για την ίδια ημέρα, ενημερώνει
// τα ίδια κελιά αντί να διπλογράφει.

import { getArticlesForAthensDay, countByAuthor, type Article } from "./cms";
import { appendRows, ensureTab, readTab, styleHeader, writeTab } from "./sheets";
import { athensYesterday, formatGreekDate } from "./time";

export const COUNTS_TAB = "Καταμέτρηση";
export const DETAIL_TAB = "Αναλυτικά";

const TOTAL_LABEL = "ΣΥΝΟΛΟ";
const AUTHOR_HEADER = "Συντάκτης";

/** Το αποτέλεσμα του δοκιμαστικού περάσματος (χωρίς εγγραφή στο Sheet). */
export interface PreviewResult {
  dryRun: true;
  day: string;
  totalArticles: number;
  authors: { authorName: string; count: number }[];
  sample: { time: string; author: string; title: string; url: string }[];
  generatedAt: string;
}

export interface ReportResult {
  /** Η ημέρα που μετρήθηκε, μορφή "YYYY-MM-DD" */
  day: string;
  totalArticles: number;
  authors: { authorName: string; count: number }[];
  spreadsheetUrl: string;
  generatedAt: string;
}

/** "DD/MM/YYYY" → "YYYYMMDD" για ταξινόμηση· "" αν δεν είναι ημερομηνία. */
function sortKey(label: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(label);
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

/**
 * Ξαναχτίζει το tab «Καταμέτρηση» προσθέτοντας/αντικαθιστώντας τη στήλη μιας
 * ημέρας. Διαβάζουμε ολόκληρο τον πίνακα και τον γράφουμε πάλι, ώστε να
 * χωρέσουν νέοι συντάκτες και νέες ημερομηνίες χωρίς χειροκίνητη παρέμβαση.
 */
/** Εξάγεται και για δοκιμές — δεν έχει παρενέργειες. */
export function rebuildCountsGrid(
  existing: string[][],
  day: string,
  counts: { authorName: string; count: number }[]
): (string | number)[][] {
  const dayLabel = formatGreekDate(day);

  const header = existing[0] ?? [AUTHOR_HEADER];
  const oldDates = header.slice(1).filter((d) => d && d !== dayLabel);

  // Οι στήλες μένουν πάντα σε φθίνουσα χρονολογική σειρά (η πιο πρόσφατη στο B),
  // ώστε να μπαίνει σωστά στη θέση της και μια παλιότερη ημέρα που συμπληρώνουμε
  // εκ των υστέρων. Ό,τι δεν διαβάζεται ως ημερομηνία πάει στο τέλος.
  const dates = [dayLabel, ...oldDates].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka && kb) return kb.localeCompare(ka);
    if (ka) return -1;
    if (kb) return 1;
    return 0;
  });

  // author → (ημερομηνία → πλήθος), από ό,τι υπάρχει ήδη στο Sheet.
  const table = new Map<string, Map<string, number>>();
  for (const row of existing.slice(1)) {
    const name = (row[0] ?? "").trim();
    if (!name || name === TOTAL_LABEL) continue;
    const perDay = new Map<string, number>();
    header.slice(1).forEach((d, i) => {
      const raw = row[i + 1];
      const n = Number(raw);
      if (d && raw !== "" && Number.isFinite(n)) perDay.set(d, n);
    });
    table.set(name, perDay);
  }

  // Η νέα μέρα αντικαθιστά ό,τι υπήρχε για την ίδια ημερομηνία.
  for (const perDay of table.values()) perDay.delete(dayLabel);
  for (const { authorName, count } of counts) {
    const perDay = table.get(authorName) ?? new Map<string, number>();
    perDay.set(dayLabel, count);
    table.set(authorName, perDay);
  }

  // Σειρά γραμμών: πρώτα όσοι έγραψαν χθες (φθίνουσα), μετά οι υπόλοιποι.
  const names = [...table.keys()].sort((a, b) => {
    const av = table.get(a)?.get(dayLabel) ?? 0;
    const bv = table.get(b)?.get(dayLabel) ?? 0;
    return bv - av || a.localeCompare(b, "el");
  });

  const rows: (string | number)[][] = [[AUTHOR_HEADER, ...dates]];
  for (const name of names) {
    const perDay = table.get(name)!;
    rows.push([name, ...dates.map((d) => (perDay.has(d) ? perDay.get(d)! : ""))]);
  }

  // Γραμμή συνόλων ανά ημέρα.
  const totals = dates.map((d) => {
    let sum = 0;
    let any = false;
    for (const perDay of table.values()) {
      if (perDay.has(d)) {
        sum += perDay.get(d)!;
        any = true;
      }
    }
    return any ? sum : "";
  });
  rows.push([TOTAL_LABEL, ...totals]);

  return rows;
}

const DETAIL_HEADER = ["Ημερομηνία", "Ώρα", "Συντάκτης", "Τίτλος", "Ενότητα", "URL"];

function detailRows(day: string, articles: Article[]): (string | number)[][] {
  const dayLabel = formatGreekDate(day);
  return [...articles]
    .sort((a, b) => a.publishedAtUtc.localeCompare(b.publishedAtUtc))
    .map((a) => [dayLabel, a.publishedAtAthens, a.authorName, a.title, a.section, a.url]);
}

/**
 * Ενημερώνει το tab «Αναλυτικά». Στη συνηθισμένη περίπτωση (νέα ημέρα) κάνει
 * απλό append· αν η ημέρα υπάρχει ήδη, ξαναγράφει το tab χωρίς τις παλιές
 * γραμμές της ημέρας ώστε να μη διπλογραφτεί τίποτα.
 */
async function updateDetailTab(day: string, articles: Article[]): Promise<void> {
  const sheetId = await ensureTab(DETAIL_TAB);
  const existing = await readTab(DETAIL_TAB);
  const dayLabel = formatGreekDate(day);
  const fresh = detailRows(day, articles);

  const hasHeader = existing[0]?.[0] === DETAIL_HEADER[0];
  const body = hasHeader ? existing.slice(1) : existing;
  const alreadyHasDay = body.some((row) => row[0] === dayLabel);

  if (!hasHeader || alreadyHasDay) {
    const kept = body.filter((row) => row[0] !== dayLabel);
    await writeTab(DETAIL_TAB, [DETAIL_HEADER, ...kept, ...fresh]);
  } else {
    await appendRows(DETAIL_TAB, fresh);
  }

  await styleHeader(sheetId, 1);
}

function normalizeDay(day?: string): string {
  const target = day ?? athensYesterday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
    throw new Error(`Μη έγκυρη ημερομηνία «${target}» — περιμένω μορφή YYYY-MM-DD`);
  }
  return target;
}

/**
 * Δοκιμαστικό πέρασμα: διαβάζει ΜΟΝΟ το CMS και επιστρέφει την καταμέτρηση,
 * χωρίς να αγγίξει καθόλου το Google Sheet και χωρίς να χρειάζεται credentials
 * για το Sheets. Χρησιμεύει για να επιβεβαιωθεί ότι το CMS απαντάει σωστά.
 */
export async function previewAuthorCounts(day?: string): Promise<PreviewResult> {
  const target = normalizeDay(day);
  const articles = await getArticlesForAthensDay(target);
  return {
    dryRun: true,
    day: target,
    totalArticles: articles.length,
    authors: countByAuthor(articles),
    // Δείγμα, για να φαίνεται με γυμνό μάτι ότι τα άρθρα είναι τα σωστά.
    sample: articles.slice(0, 5).map((a) => ({
      time: a.publishedAtAthens,
      author: a.authorName,
      title: a.title,
      url: a.url,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Τρέχει την αναφορά για μία ημέρα (default: χθες, ώρα Ελλάδας) και τη γράφει
 * στο Google Sheet.
 */
export async function runAuthorCountsReport(day?: string): Promise<ReportResult> {
  const target = normalizeDay(day);

  const articles = await getArticlesForAthensDay(target);
  const counts = countByAuthor(articles);

  const countsSheetId = await ensureTab(COUNTS_TAB);
  const existing = await readTab(COUNTS_TAB);
  await writeTab(COUNTS_TAB, rebuildCountsGrid(existing, target, counts));
  await styleHeader(countsSheetId, 1);

  await updateDetailTab(target, articles);

  return {
    day: target,
    totalArticles: articles.length,
    authors: counts,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.SHEETS_SPREADSHEET_ID}/edit`,
    generatedAt: new Date().toISOString(),
  };
}
