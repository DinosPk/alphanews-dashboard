import { NextResponse } from "next/server";
import { getRealtime } from "@/lib/ga4";

// Πάντα φρέσκα δεδομένα — χωρίς caching.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getRealtime();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
