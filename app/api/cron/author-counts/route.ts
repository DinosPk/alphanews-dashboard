// Ημερήσιο job: καταμέτρηση άρθρων ανά συντάκτη για το προηγούμενο 24ωρο.
//
// Το Vercel Cron τρέχει ΜΟΝΟ σε UTC, ενώ εμείς θέλουμε 09:00 ώρα Ελλάδας —
// που είναι 06:00 UTC το καλοκαίρι και 07:00 UTC τον χειμώνα. Γι' αυτό το
// vercel.json το χτυπάει και τις δύο ώρες, και εδώ κρατάμε μόνο την εκτέλεση
// που πέφτει πραγματικά στις 09:00 Ελλάδας. Έτσι δεν χρειάζεται καμία
// χειροκίνητη αλλαγή δύο φορές τον χρόνο.

import { NextRequest, NextResponse } from "next/server";
import { previewAuthorCounts, runAuthorCountsReport } from "@/lib/authorReport";
import { athensHour } from "@/lib/time";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Το κατέβασμα των άρθρων + η εγγραφή στο Sheet θέλουν λίγο χρόνο.
// (60″ = το όριο του Vercel Hobby· σε Pro μπορεί να πάει έως 300.)
export const maxDuration = 60;

const TARGET_HOUR = 9;

/**
 * Το Vercel Cron στέλνει `Authorization: Bearer $CRON_SECRET`. Δεχόμαστε και
 * `?secret=` για χειροκίνητο τρέξιμο από browser. Αν δεν έχει οριστεί
 * CRON_SECRET, επιτρέπουμε μόνο τα αιτήματα του ίδιου του Vercel Cron.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return req.headers.get("x-vercel-cron") !== null;

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Μη εξουσιοδοτημένο αίτημα" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;

  // `dry=1` → μόνο ανάγνωση από το CMS, χωρίς εγγραφή στο Sheet. Είναι ο
  // τρόπος να ελεγχθεί το CMS από τον browser, πριν μπουν καν τα credentials
  // του Sheets. Δεν περνάει από το φίλτρο ώρας.
  if (params.get("dry") === "1") {
    try {
      const preview = await previewAuthorCounts(params.get("day") ?? undefined);
      return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[author-counts] dry run απέτυχε:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // `force=1` παρακάμπτει το φίλτρο ώρας (χειροκίνητο τρέξιμο/δοκιμή).
  const force = params.get("force") === "1";
  const hour = athensHour();

  if (!force && hour !== TARGET_HOUR) {
    return NextResponse.json(
      {
        skipped: true,
        reason: `Η ώρα Ελλάδας είναι ${hour}:00 — το job τρέχει στις ${TARGET_HOUR}:00.`,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // `?day=YYYY-MM-DD` για να ξαναγυριστεί μια παλιότερη ημέρα.
    const result = await runAuthorCountsReport(params.get("day") ?? undefined);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[author-counts] απέτυχε:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
