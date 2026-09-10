// Χειρισμός ώρας Ελλάδας (Europe/Athens) χωρίς εξωτερική βιβλιοθήκη.
//
// Η Ελλάδα αλλάζει ώρα (EET = UTC+2 τον χειμώνα, EEST = UTC+3 το καλοκαίρι),
// ενώ το Vercel Cron τρέχει ΜΟΝΟ σε UTC. Όλοι οι υπολογισμοί εδώ βγάζουν το
// offset δυναμικά μέσω Intl, ώστε το «00:00 με 23:59» να είναι πάντα σωστό.

export const ATHENS_TZ = "Europe/Athens";

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ATHENS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export interface AthensParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/** Τα συστατικά μιας στιγμής, όπως φαίνονται στο ρολόι της Ελλάδας. */
export function toAthensParts(date: Date): AthensParts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    // Το en-GB δίνει "24" αντί για "00" τα μεσάνυχτα — το κανονικοποιούμε.
    hour: map.hour === "24" ? "00" : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/** Πόσα ms μπροστά από το UTC είναι η Ελλάδα τη συγκεκριμένη στιγμή. */
function athensOffsetMs(date: Date): number {
  const p = toAthensParts(date);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  // Στρογγυλοποιούμε στο δευτερόλεπτο για να μη μας χαλάνε τα ms.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Η ημερομηνία στην Ελλάδα, μορφή "YYYY-MM-DD". */
export function athensDateString(date: Date = new Date()): string {
  const p = toAthensParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Η ώρα στην Ελλάδα ως ακέραιος 0–23 — τη χρησιμοποιεί το cron gate. */
export function athensHour(date: Date = new Date()): number {
  return Number(toAthensParts(date).hour);
}

/** Η χθεσινή ημερομηνία σε ώρα Ελλάδας, μορφή "YYYY-MM-DD". */
export function athensYesterday(now: Date = new Date()): string {
  const today = athensDateString(now);
  const [y, m, d] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return prev.toISOString().slice(0, 10);
}

/**
 * Το πλήρες 24ωρο μιας ημέρας σε ώρα Ελλάδας, εκφρασμένο σε UTC:
 * από 00:00:00.000 έως 23:59:59.999.
 */
export function athensDayWindow(day: string): { startUtc: Date; endUtc: Date } {
  return {
    startUtc: athensWallClockToUtc(day, 0, 0, 0, 0),
    endUtc: athensWallClockToUtc(day, 23, 59, 59, 999),
  };
}

/** Ώρα ρολογιού Ελλάδας → στιγμή σε UTC. */
function athensWallClockToUtc(
  day: string,
  hour: number,
  minute: number,
  second: number,
  ms: number
): Date {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, minute, second, ms);
  // Πρώτη εκτίμηση με το offset της «αφελούς» στιγμής, μετά μία διόρθωση —
  // αρκεί ακόμη και τις δύο ημέρες τον χρόνο που αλλάζει η ώρα.
  let guess = naive - athensOffsetMs(new Date(naive));
  guess = naive - athensOffsetMs(new Date(guess));
  return new Date(guess);
}

/** Μορφή "DD/MM/YYYY" για εμφάνιση στο Google Sheet. */
export function formatGreekDate(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}
