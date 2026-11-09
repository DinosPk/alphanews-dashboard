import { NextResponse } from "next/server";
import { getRealtime } from "@/lib/ga4";
import { cachedGA4, TTL } from "@/lib/gaCache";

// Το route είναι δυναμικό· το caching γίνεται στο gaCache (κοινό για όλους).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await cachedGA4(["realtime"], TTL.realtime, getRealtime);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
