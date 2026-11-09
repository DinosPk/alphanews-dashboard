import { NextRequest, NextResponse } from "next/server";
import { getHistorical } from "@/lib/ga4";
import { cachedGA4, TTL } from "@/lib/gaCache";
import type { RangeKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID: RangeKey[] = ["24h", "7d", "30d"];

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("range") as RangeKey | null;
  const range: RangeKey = param && VALID.includes(param) ? param : "24h";
  const section = req.nextUrl.searchParams.get("section");
  const data = await cachedGA4(
    ["historical", range, section ?? "all"],
    range === "24h" ? TTL.rolling24h : TTL.historical,
    () => getHistorical(range, section)
  );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
