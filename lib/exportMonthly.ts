// Export των μηνιαίων στοιχείων σε PDF.
//
// Τα γραφήματα σχεδιάζονται σε <canvas> (όχι screenshot της σελίδας), ώστε:
//  - να έχουν την τιμή κάθε μήνα πάνω από κάθε μπάρα,
//  - να βγαίνουν σε λευκό φόντο, κατάλληλο για εκτύπωση/email,
//  - τα ελληνικά να αποδίδονται σωστά (το jsPDF δεν έχει ελληνική γραμματοσειρά,
//    οπότε ΟΛΟ το κείμενο ζωγραφίζεται στο canvas με τη γραμματοσειρά του browser).
// Το jsPDF φορτώνεται δυναμικά μόνο όταν πατηθεί το κουμπί.

import type { MonthlyData, MonthPoint } from "./types";

type Metric = "pageViews" | "users" | "sessions";

export interface ExportChart {
  metric: Metric;
  title: string;
  color: string;
}

const nf = new Intl.NumberFormat("el-GR");
const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Διαστάσεις A4 portrait σε mm και κλίμακα canvas (px ανά mm) για ευκρίνεια.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const PX_PER_MM = 8;

/** Στρογγυλό βήμα άξονα (1/2/5 × 10^n) ώστε οι ενδείξεις να είναι «καθαρές». */
function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

function tickFmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("el-GR", { maximumFractionDigits: 1 })}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}χ`;
  return `${v}`;
}

/** Ζωγραφίζει ένα γράφημα μπαρών με ετικέτα τιμής πάνω από κάθε μπάρα. */
function drawChart(
  months: MonthPoint[],
  chart: ExportChart,
  partialLast: boolean,
  wMm: number,
  hMm: number
): HTMLCanvasElement {
  const W = Math.round(wMm * PX_PER_MM);
  const H = Math.round(hMm * PX_PER_MM);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const s = PX_PER_MM / 4; // βασική μονάδα κλίμακας κειμένου

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Τίτλος + σύνολο περιόδου
  const total = months.reduce((a, m) => a + m[chart.metric], 0);
  ctx.fillStyle = chart.color;
  ctx.fillRect(0, 6 * s, 3 * s, 16 * s);
  ctx.fillStyle = "#111726";
  ctx.font = `700 ${15 * s}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(chart.title, 9 * s, 14 * s);
  ctx.fillStyle = "#6b7795";
  ctx.font = `500 ${11 * s}px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`Σύνολο περιόδου: ${nf.format(total)}`, W, 14 * s);

  // Περιοχή σχεδίασης
  const left = 46 * s;
  const right = W - 4 * s;
  const top = 50 * s; // χώρος για τίτλο + ετικέτες τιμών
  const bottom = H - 26 * s; // χώρος για ετικέτες μηνών
  const plotH = bottom - top;
  const plotW = right - left;

  const peak = Math.max(...months.map((m) => m[chart.metric]), 1);
  const step = niceStep((peak * 1.08) / 4);
  const ticks = Math.ceil((peak * 1.08) / step);
  const max = step * ticks;

  // Πλέγμα + άξονας Y
  ctx.font = `500 ${10 * s}px ${FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const y = bottom - (v / max) * plotH;
    ctx.strokeStyle = i === 0 ? "#c9cfdd" : "#e8ebf2";
    ctx.lineWidth = i === 0 ? 1.5 * s : 1 * s;
    ctx.setLineDash(i === 0 ? [] : [4 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = "#8a94ad";
    ctx.fillText(tickFmt(v), left - 8 * s, y);
  }
  ctx.setLineDash([]);

  // Μπάρες
  const n = months.length;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.min(slot * 0.62, 70 * s);
  const r = Math.min(6 * s, barW / 2);

  // Μέγεθος γραμματοσειράς ετικέτας ώστε να χωράει στο πλάτος της θέσης
  const longest = months.reduce(
    (a, m) => Math.max(a, nf.format(m[chart.metric]).length),
    1
  );
  const labelPx = Math.max(8 * s, Math.min(12 * s, (slot * 0.95) / (longest * 0.6)));

  months.forEach((m, i) => {
    const v = m[chart.metric];
    const cx = left + slot * i + slot / 2;
    const h = (v / max) * plotH;
    const x = cx - barW / 2;
    const y = bottom - h;
    const partial = partialLast && i === n - 1;

    ctx.globalAlpha = partial ? 0.4 : 1;
    ctx.fillStyle = chart.color;
    ctx.beginPath();
    if (h > r) {
      ctx.moveTo(x, bottom);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, bottom);
    } else {
      ctx.rect(x, y, barW, h);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Τιμή πάνω από τη μπάρα
    ctx.fillStyle = "#111726";
    ctx.font = `700 ${labelPx}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(nf.format(v) + (partial ? "*" : ""), cx, y - 5 * s);

    // Ετικέτα μήνα
    ctx.fillStyle = "#4a5470";
    ctx.font = `600 ${10.5 * s}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.fillText(m.label, cx, bottom + 8 * s);
  });

  return c;
}

/** Δημιουργεί και κατεβάζει το PDF με τα μηνιαία γραφήματα. */
export async function exportMonthlyPdf(
  data: MonthlyData,
  charts: ExportChart[],
  sectionLabel: string
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const contentW = PAGE_W - MARGIN * 2;
  const months = data.months;
  const first = months[0]?.label ?? "";
  const last = months[months.length - 1]?.label ?? "";
  const now = new Date();

  // Κεφαλίδα (ως canvas, για σωστά ελληνικά)
  const headH = 26;
  const head = document.createElement("canvas");
  head.width = Math.round(contentW * PX_PER_MM);
  head.height = Math.round(headH * PX_PER_MM);
  const hc = head.getContext("2d")!;
  const s = PX_PER_MM / 4;
  hc.fillStyle = "#ffffff";
  hc.fillRect(0, 0, head.width, head.height);
  hc.fillStyle = "#e4002b";
  hc.fillRect(0, 0, head.width, 3 * s);
  hc.textBaseline = "top";
  hc.fillStyle = "#111726";
  hc.font = `800 ${22 * s}px ${FONT}`;
  hc.fillText("alphanews · Μηνιαία στοιχεία", 0, 14 * s);
  hc.fillStyle = "#4a5470";
  hc.font = `500 ${12 * s}px ${FONT}`;
  hc.fillText(
    `Ενότητα: ${sectionLabel}  ·  Περίοδος: ${first} – ${last}  ·  Πηγή: Google Analytics 4${data.demo ? " (demo)" : ""}`,
    0,
    50 * s
  );
  hc.fillStyle = "#8a94ad";
  hc.font = `500 ${10.5 * s}px ${FONT}`;
  hc.fillText(
    `Εξαγωγή: ${now.toLocaleDateString("el-GR")} ${now.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}` +
      (data.partialLast ? "  ·  * ο τελευταίος μήνας είναι σε εξέλιξη (μερικά στοιχεία)" : ""),
    0,
    72 * s
  );
  doc.addImage(head.toDataURL("image/png"), "PNG", MARGIN, MARGIN, contentW, headH);

  // Τρία γραφήματα στοιβαγμένα στη σελίδα
  const gap = 6;
  const avail = PAGE_H - MARGIN * 2 - headH - gap;
  const chartH = (avail - gap * (charts.length - 1)) / charts.length;
  let y = MARGIN + headH + gap;
  for (const ch of charts) {
    const cv = drawChart(months, ch, data.partialLast, contentW, chartH);
    doc.addImage(cv.toDataURL("image/png"), "PNG", MARGIN, y, contentW, chartH);
    y += chartH + gap;
  }

  const slug = sectionLabel === "Όλες οι ενότητες" ? "all" : sectionLabel;
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  doc.save(`alphanews-miniaia-${slug}-${stamp}.pdf`);
}
