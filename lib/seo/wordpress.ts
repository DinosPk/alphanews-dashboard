// WordPress REST API του alphatv.gr (δημόσιο, χωρίς credentials).
//   /wp-json/wp/v2/tags   → όλα τα tags (id, name, slug, count, link)
//   /wp-json/wp/v2/posts  → άρθρο από slug (για «πρόταση tags» σε υπάρχον URL)

import type { WpTag } from "./types";
import { cached } from "./cache";

export const WP_BASE = (process.env.WP_BASE_URL || "https://www.alphatv.gr").replace(/\/$/, "");
const PER_PAGE = 100;
const MAX_PAGES = Number(process.env.WP_TAGS_MAX_PAGES || 200); // 20.000 tags
// Το firewall του alphatv.gr απαντά 404 σε μη-browser User-Agent, γι' αυτό
// στέλνουμε κανονικό UA browser (μόνο GET σε δημόσια endpoints, με ήπιο ρυθμό).
const UA =
  process.env.WP_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|figure|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|h\d|li|div|br)>/gi, ".\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .trim();
}

function pathOf(link: string): string {
  try {
    return new URL(link).pathname;
  } catch {
    return link;
  }
}

interface RawTag {
  id: number;
  name: string;
  slug: string;
  count: number;
  link: string;
}

// Το REST API του alphatv.gr απαντά ΜΟΝΟ σε συνδεδεμένους χρήστες
// (σφάλμα 404 «api_error_access» χωρίς login). Σύνδεση με WordPress
// Application Password: wp-admin → Users → Profile → Application Passwords.
const WP_USER = process.env.WP_APP_USER;
const WP_PASS = process.env.WP_APP_PASSWORD;

function authHeader(): Record<string, string> {
  if (!WP_USER || !WP_PASS) return {};
  const token = Buffer.from(`${WP_USER}:${WP_PASS.replace(/\s+/g, "")}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function getJson<T>(url: string): Promise<{ data: T; totalPages: number }> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "el-GR,el;q=0.9,en;q=0.8",
      "User-Agent": UA,
      ...authHeader(),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let code = "";
    try {
      code = ((await res.json()) as { code?: string }).code ?? "";
    } catch {
      /* όχι JSON */
    }
    const hint =
      code === "api_error_access"
        ? WP_USER
          ? " — το Application Password δεν έγινε δεκτό (έλεγξε WP_APP_USER / WP_APP_PASSWORD)"
          : " — το REST API θέλει login: όρισε WP_APP_USER και WP_APP_PASSWORD"
        : res.status === 401
        ? " — λάθος username ή Application Password"
        : "";
    throw new Error(`WordPress ${res.status}${code ? ` (${code})` : ""}${hint}`);
  }
  const totalPages = Number(res.headers.get("x-wp-totalpages") || 1);
  return { data: (await res.json()) as T, totalPages };
}

function tagsUrl(page: number) {
  return `${WP_BASE}/wp-json/wp/v2/tags?per_page=${PER_PAGE}&page=${page}&orderby=count&order=desc&hide_empty=false&_fields=id,name,slug,count,link`;
}

function fetchTagsRest(): Promise<WpTag[]> {
  return (async () => {
    const first = await getJson<RawTag[]>(tagsUrl(1));
    const pages = Math.min(first.totalPages, MAX_PAGES);
    const all: RawTag[] = [...first.data];
    // Σε παρτίδες των 6 για να μη φορτώσουμε τον server του site.
    for (let p = 2; p <= pages; p += 6) {
      const batch = [];
      for (let q = p; q < p + 6 && q <= pages; q++) batch.push(getJson<RawTag[]>(tagsUrl(q)));
      for (const r of await Promise.all(batch)) all.push(...r.data);
    }
    return all.map((t) => ({
      id: t.id,
      name: decodeEntities(t.name).trim(),
      slug: t.slug,
      count: t.count,
      path: pathOf(t.link),
    }));
  })();
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "text/html,application/xml;q=0.9,*/*;q=0.8", "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} στο ${url.replace(WP_BASE, "")}`);
  return res.text();
}

/** «fotia-2» → «fotia», «ntonalnt-trab» → «ntonalnt trab» (προσωρινό όνομα μέχρι να έρθει τίτλος). */
export function slugToName(slug: string): string {
  return decodeURIComponent(slug).replace(/-[2-9]$/, "").replace(/-/g, " ");
}

/**
 * Tags από το δημόσιο sitemap του Yoast (post_tag-sitemap*.xml). Δεν έχει
 * ονόματα ούτε πλήθος άρθρων — μόνο URL και ημερομηνία τελευταίου άρθρου.
 * Το Yoast αφήνει έξω τα άδεια και τα noindex tags.
 */
async function fetchTagsSitemap(): Promise<WpTag[]> {
  const index = await getText(`${WP_BASE}/sitemap_index.xml`);
  let maps = [...index.matchAll(/<loc>([^<]*post_tag-sitemap\d*\.xml)<\/loc>/g)].map((m) => m[1].trim());
  if (!maps.length) maps = [`${WP_BASE}/post_tag-sitemap.xml`];
  const tags: WpTag[] = [];
  const seen = new Set<string>();
  for (const xml of await Promise.all(maps.map((u) => getText(u)))) {
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
      if (!loc) continue;
      const path = pathOf(decodeEntities(loc));
      if (seen.has(path)) continue;
      seen.add(path);
      const slug = path.split("/").filter(Boolean).pop() ?? "";
      tags.push({
        id: -(tags.length + 1), // δεν έχουμε WP id — αρνητικό, μοναδικό
        name: slugToName(slug),
        slug,
        count: null,
        path,
        lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim(),
      });
    }
  }
  if (!tags.length) throw new Error("Το sitemap δεν έχει tags");
  return tags;
}

export interface TagSource {
  tags: WpTag[];
  source: "rest" | "sitemap";
  /** Γιατί δεν χρησιμοποιήθηκε το REST API */
  restError?: string;
}

/**
 * Όλα τα tags του site (cache 30′). Πρώτα το REST API (έχει ονόματα & πλήθος
 * άρθρων)· αν είναι κλειστό — όπως στο alphatv.gr χωρίς login — το sitemap.
 */
export function fetchAllTags(): Promise<TagSource> {
  return cached("wp:tags", 30 * 60 * 1000, async () => {
    try {
      return { tags: await fetchTagsRest(), source: "rest" as const };
    } catch (e) {
      const restError = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      return { tags: await fetchTagsSitemap(), source: "sitemap" as const, restError };
    }
  });
}

/** Το πρόθεμα των σελίδων tag (π.χ. "/tag/"), από το link του πρώτου tag. */
export function tagBasePath(tags: WpTag[]): string {
  const p = tags[0]?.path ?? "/tag/x/";
  const m = p.match(/^(.*\/)[^/]+\/?$/);
  return m ? m[1] : "/tag/";
}

export interface WpArticle {
  title: string;
  text: string;
  /** Tags του άρθρου (path → όνομα όπως φαίνεται στη σελίδα) */
  tags: { path: string; name: string }[];
  link: string;
}

/**
 * Φέρνει άρθρο από τη δημόσια σελίδα του (HTML) — δουλεύει χωρίς το REST API.
 * Τίτλος από og:title/H1, κείμενο από το <article>, tags από τα links /tag/.
 */
export async function fetchArticleByUrl(url: string, tagBase = "/tag/"): Promise<WpArticle | null> {
  const html = await getText(url);
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"))?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = stripHtml(meta("og:title") ?? h1 ?? "")
    .replace(/\s*[|–-]\s*Alpha\s*TV.*$/i, "")
    .trim();
  const article =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html;
  const tagRe = new RegExp(`<a[^>]+href=["'](?:https?://[^"'/]+)?(${tagBase.replace(/\//g, "\\/")}[^"'?#]+)["'][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
  const tags = new Map<string, string>();
  for (const m of html.matchAll(tagRe)) {
    const path = m[1].replace(/\/?$/, "/");
    const name = stripHtml(m[2]).replace(/^#/, "").trim();
    if (name && !tags.has(path)) tags.set(path, name);
  }
  if (!title) return null;
  return {
    title,
    // Χωρίς τα links των tags, αλλιώς τα υπάρχοντα tags «βρίσκονται» στο κείμενο.
    text: stripHtml(article.replace(tagRe, " ")),
    tags: [...tags.entries()].map(([path, name]) => ({ path, name })),
    link: url,
  };
}
