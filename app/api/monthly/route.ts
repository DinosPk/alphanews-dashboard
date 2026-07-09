import { NextRequest, NextResponse } from "next/server";
import { getMonthly } from "@/lib/ga4";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get("section");
  const data = await getMonthly(section);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
