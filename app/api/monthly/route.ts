import { NextRequest, NextResponse } from "next/server";
import { getMonthly } from "@/lib/ga4";
import { cachedGA4, TTL } from "@/lib/gaCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get("section");
  const data = await cachedGA4(
    ["monthly", section ?? "all"],
    TTL.monthly,
    () => getMonthly(section)
  );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
