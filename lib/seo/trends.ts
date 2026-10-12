// Google Trends — «Trending now» RSS για την Ελλάδα (δημόσιο feed).

import { cached } from "./cache";
import { decodeEntities } from "./wordpress";
import type { TrendItem } from "./types";

const GEO = process.env.TRENDS_GEO || "GR";

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim();
}

/** Το Trends γράφει «αντώνησ σαμαράσ» — διορθώνουμε το τελικό σ. */
function fixFinalSigma(s: string) {
  return s.replace(/σ(?=\s|$|[.,!?])/g, "ς");
}

export function parseTrendsRss(xml: string): TrendItem[] {
  const items = xml.split("<item>").slice(1);
  return items.map((raw) => {
    const body = raw.split("</item>")[0];
    const traffic = tag(body, "ht:approx_traffic");
    const news = body
      .split("<ht:news_item>")
      .slice(1)
      .map((n) => ({
        title: tag(n, "ht:news_item_title"),
        url: tag(n, "ht:news_item_url"),
        source: tag(n, "ht:news_item_source"),
      }))
      .filter((n) => n.title);
    return {
      title: fixFinalSigma(tag(body, "title")),
      traffic,
      trafficNum: Number(traffic.replace(/[^\d]/g, "")) || 0,
      pubDate: tag(body, "pubDate"),
      news,
    };
  });
}

/** Τρέχοντα trends (cache 10′). */
export function fetchTrends(): Promise<TrendItem[]> {
  return cached(`trends:${GEO}`, 10 * 60 * 1000, async () => {
    const res = await fetch(`https://trends.google.com/trending/rss?geo=${GEO}`, {
      headers: { "User-Agent": "Mozilla/5.0 alphanews-dashboard" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Google Trends ${res.status}`);
    return parseTrendsRss(await res.text());
  });
}
