import { NextResponse } from "next/server";
import { getGap } from "@/lib/seo/analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getGap();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seo/gap]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
