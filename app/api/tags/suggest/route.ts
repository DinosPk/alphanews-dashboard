import { NextRequest, NextResponse } from "next/server";
import { suggestTags } from "@/lib/seo/analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { title?: string; text?: string; url?: string };
    if (body.url && !/^https?:\/\/([a-z0-9-]+\.)*alphatv\.gr\//i.test(body.url)) {
      return NextResponse.json({ error: "Δέχομαι μόνο URL του alphatv.gr" }, { status: 400 });
    }
    const data = await suggestTags({
      title: body.title?.slice(0, 500),
      text: body.text?.slice(0, 60000),
      url: body.url,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
