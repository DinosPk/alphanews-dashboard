import { NextResponse } from "next/server";
import { quotaSnapshot } from "@/lib/quotaGuard";

export const dynamic = "force-dynamic";

// Τελευταία γνωστά υπόλοιπα quota GA4 αυτού του instance (για έλεγχο).
export async function GET() {
  return NextResponse.json(quotaSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
