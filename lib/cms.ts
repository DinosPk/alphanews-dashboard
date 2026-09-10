// Ανάγνωση άρθρων από το CMS του alphatv.gr (WordPress REST API).
//
// Το WordPress εκθέτει τα άρθρα στο /wp-json/wp/v2/posts. Δύο λεπτά σημεία:
//
// 1) Τα φίλτρα `after`/`before` του WP συγκρίνονται με το post_date, δηλαδή
//    την ΤΟΠΙΚΗ ώρα του site — και δεν ξέρουμε σίγουρα σε ποια ζώνη είναι
//    ρυθμισμένο. Γι' αυτό ρωτάμε με «φαρδύ» παράθυρο (±26 ώρες) και μετά
//    φιλτράρουμε ακριβώς εμείς με βάση το `date_gmt` (καθαρό UTC).
// 2) Τα ονόματα συντακτών δεν έρχονται μαζί με τα posts — μόνο το author ID.
//    Τα παίρνουμε μαζικά από το /wp-json/wp/v2/users, με fallback σε `_embed`.

import { athensDayWindow, toAthensParts } from "./time";

/** Ένα άρθρο όπως το χρειαζόμαστε για την καταμέτρηση. */
export interface Article {
  id: number;
  /** ISO 8601 σε UTC (από το date_gmt του WP) */
  publishedAtUtc: string;
  /** Ώρα δημοσίευσης σε ώρα Ελλάδας, μορφή "HH:mm" */
  publishedAtAthens: string;
  title: string;
  url: string;
  authorId: number;
  authorName: string;
  /** Το πρώτο path segment του URL (π.χ. "koinonia") — χρήσιμο για ενότητα */
  section: string;
}

interface WpPost {
  id: number;
  date: string;
  date_gmt: string;
  link: string;
  title?: { rendered?: string };
  author: number;
  _embedded?: { author?: { id: number; name?: string }[] };
}

const DEFAULT_BASE = "https://www.alphatv.gr";

function cmsBase(): string {
  return (process.env.CMS_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * Headers για το WP REST. Αν το /wp-json είναι κλειστό, βάλε στα env
 * CMS_WP_USER + CMS_WP_APP_PASSWORD (Application Password από το WP admin).
 */
function cmsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "alphanews-dashboard/1.0 (author-counts)",
  };
  const user = process.env.CMS_WP_USER;
  const pass = process.env.CMS_WP_APP_PASSWORD;
  if (user && pass) {
    const token = Buffer.from(`${user}:${pass}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }
  return headers;
}

async function fetchJson(url: string): Promise<{ body: unknown; headers: Headers }> {
  const res = await fetch(url, { headers: cmsHeaders(), cache: "no-store" });
  if (!res.ok) {
    const preview = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`CMS ${res.status} ${res.statusText} για ${url}${preview ? ` — ${preview}` : ""}`);
  }
  return { body: await res.json(), headers: res.headers };
}

/** Το κείμενο του τίτλου, χωρίς HTML entities/tags που βάζει το WP. */
function decodeTitle(raw: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#039;": "'",
    "&#8217;": "’",
    "&#8216;": "‘",
    "&#8220;": "“",
    "&#8221;": "”",
    "&nbsp;": " ",
    "&hellip;": "…",
    "&ndash;": "–",
    "&mdash;": "—",
  };
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => entities[m] ?? m)
    .trim();
}

/** Το πρώτο path segment του URL — αντιστοιχεί στην ενότητα του alphatv.gr. */
function sectionFromUrl(link: string): string {
  try {
    const seg = new URL(link).pathname.split("/").filter(Boolean);
    return seg[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * Κατεβάζει ΟΛΑ τα posts του WP σε ένα χρονικό παράθυρο (τοπική ώρα site),
 * ακολουθώντας το pagination μέχρι να τελειώσουν οι σελίδες.
 */
async function fetchPostsWindow(afterLocal: string, beforeLocal: string): Promise<WpPost[]> {
  const perPage = 100;
  const maxPages = 50; // δικλείδα: 5.000 άρθρα/ημέρα δεν πρόκειται να βγουν
  const out: WpPost[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `${cmsBase()}/wp-json/wp/v2/posts` +
      `?after=${encodeURIComponent(afterLocal)}` +
      `&before=${encodeURIComponent(beforeLocal)}` +
      `&per_page=${perPage}&page=${page}&orderby=date&order=asc` +
      `&_fields=id,date,date_gmt,link,title,author`;

    const { body, headers } = await fetchJson(url);
    const batch = body as WpPost[];
    if (!Array.isArray(batch)) throw new Error("Το WP δεν επέστρεψε λίστα από posts");
    out.push(...batch);

    const totalPages = Number(headers.get("x-wp-totalpages") || "0");
    if (batch.length < perPage) break;
    if (totalPages && page >= totalPages) break;
  }

  return out;
}

/** Ονόματα συντακτών ανά ID. Fallback σε "—" αν το users endpoint είναι κλειστό. */
async function fetchAuthorNames(ids: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const unique = [...new Set(ids)].filter((id) => Number.isFinite(id) && id > 0);
  if (unique.length === 0) return names;

  // Το users endpoint δέχεται μέχρι 100 IDs ανά κλήση.
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const url =
      `${cmsBase()}/wp-json/wp/v2/users` +
      `?include=${chunk.join(",")}&per_page=100&_fields=id,name`;
    try {
      const { body } = await fetchJson(url);
      for (const u of body as { id: number; name?: string }[]) {
        if (u?.id && u.name) names.set(u.id, u.name.trim());
      }
    } catch {
      // Κλειστό endpoint — τα υπόλοιπα ονόματα θα έρθουν από το _embed fallback.
    }
  }
  return names;
}

/** Fallback: ζητάμε τα ίδια posts με ?_embed=author για να πάρουμε ονόματα. */
async function fillNamesViaEmbed(
  posts: WpPost[],
  names: Map<number, string>
): Promise<void> {
  const missing = posts.filter((p) => !names.has(p.author)).map((p) => p.id);
  if (missing.length === 0) return;

  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const url =
      `${cmsBase()}/wp-json/wp/v2/posts` +
      `?include=${chunk.join(",")}&per_page=100&_embed=author&_fields=id,author,_links,_embedded`;
    try {
      const { body } = await fetchJson(url);
      for (const p of body as WpPost[]) {
        const embedded = p._embedded?.author?.[0];
        if (embedded?.id && embedded.name) names.set(embedded.id, embedded.name.trim());
      }
    } catch {
      return; // δεν επιμένουμε — θα πέσουμε στο "Άγνωστος συντάκτης"
    }
  }
}

/**
 * Όλα τα άρθρα που δημοσιεύτηκαν μια συγκεκριμένη ημέρα (00:00–23:59:59
 * ώρα Ελλάδας). Το `day` είναι σε μορφή "YYYY-MM-DD".
 */
export async function getArticlesForAthensDay(day: string): Promise<Article[]> {
  const { startUtc, endUtc } = athensDayWindow(day);

  // Φαρδύ παράθυρο στην τοπική ώρα του site (±26h) — κόβουμε ακριβώς παρακάτω.
  const pad = 26 * 60 * 60 * 1000;
  const afterLocal = new Date(startUtc.getTime() - pad).toISOString().slice(0, 19);
  const beforeLocal = new Date(endUtc.getTime() + pad).toISOString().slice(0, 19);

  const posts = await fetchPostsWindow(afterLocal, beforeLocal);

  // Ακριβές κόψιμο στο 24ωρο ώρας Ελλάδας, με βάση το date_gmt (UTC).
  const inWindow = posts.filter((p) => {
    const t = Date.parse(`${p.date_gmt}Z`.replace(/Z+$/, "Z"));
    return Number.isFinite(t) && t >= startUtc.getTime() && t <= endUtc.getTime();
  });

  const names = await fetchAuthorNames(inWindow.map((p) => p.author));
  await fillNamesViaEmbed(inWindow, names);

  return inWindow.map((p) => {
    const utcIso = new Date(Date.parse(`${p.date_gmt}Z`.replace(/Z+$/, "Z"))).toISOString();
    const parts = toAthensParts(new Date(utcIso));
    return {
      id: p.id,
      publishedAtUtc: utcIso,
      publishedAtAthens: `${parts.hour}:${parts.minute}`,
      title: decodeTitle(p.title?.rendered ?? ""),
      url: p.link,
      authorId: p.author,
      authorName: names.get(p.author) || `Άγνωστος συντάκτης (#${p.author})`,
      section: sectionFromUrl(p.link),
    };
  });
}

/** Μία γραμμή της καταμέτρησης: συντάκτης → πλήθος άρθρων. */
export interface AuthorCount {
  authorName: string;
  count: number;
}

/** Ομαδοποίηση άρθρων ανά συντάκτη, φθίνουσα κατά πλήθος. */
export function countByAuthor(articles: Article[]): AuthorCount[] {
  const map = new Map<string, number>();
  for (const a of articles) {
    map.set(a.authorName, (map.get(a.authorName) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([authorName, count]) => ({ authorName, count }))
    .sort((a, b) => b.count - a.count || a.authorName.localeCompare(b.authorName, "el"));
}
