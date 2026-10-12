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

/** Όλα τα tags του site (cache 30′). */
export function fetchAllTags(): Promise<WpTag[]> {
  return cached("wp:tags", 30 * 60 * 1000, async () => {
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
  tagIds: number[];
  link: string;
}

/** Φέρνει άρθρο από URL του alphatv.gr (μέσω slug). */
export async function fetchArticleByUrl(url: string): Promise<WpArticle | null> {
  const u = new URL(url);
  const slug = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
  if (!slug) return null;
  const { data } = await getJson<
    { title: { rendered: string }; content: { rendered: string }; tags: number[]; link: string }[]
  >(
    `${WP_BASE}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=title,content,tags,link`
  );
  const post = data[0];
  if (!post) return null;
  return {
    title: stripHtml(post.title.rendered),
    text: stripHtml(post.content.rendered),
    tagIds: post.tags ?? [],
    link: post.link,
  };
}
