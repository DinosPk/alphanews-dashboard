// Google Search Console — Search Analytics API.
//
// Auth (με σειρά προτεραιότητας):
//   1. OAuth: GA4_OAUTH_CLIENT_ID + GA4_OAUTH_CLIENT_SECRET + refresh token
//      (GSC_OAUTH_REFRESH_TOKEN, αλλιώς GA4_OAUTH_REFRESH_TOKEN). Το token
//      ΠΡΕΠΕΙ να έχει το scope webmasters.readonly — το get-oauth-token.mjs
//      πλέον ζητάει και τα δύο scopes.
//   2. Service account (GA4_CREDENTIALS_JSON ή GA4_CLIENT_EMAIL/PRIVATE_KEY),
//      αφού προστεθεί ως χρήστης στο GSC property.

import { OAuth2Client, GoogleAuth } from "google-auth-library";
import { cached } from "./cache";
import { NEWS_PATHS } from "../sections";

// Καθάρισμα: κενά, εισαγωγικά και αλλαγές γραμμής που μπαίνουν κατά την επικόλληση.
const SITE = (() => {
  const raw = (process.env.GSC_SITE_URL || "sc-domain:alphatv.gr").trim().replace(/^["']|["']$/g, "").trim();
  // URL-prefix property: η Google θέλει ΑΚΡΙΒΩΣ τη μορφή «https://www.alphatv.gr/» (με / στο τέλος).
  return /^https?:\/\//i.test(raw) && !raw.endsWith("/") ? `${raw}/` : raw;
})();
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://searchconsole.googleapis.com/webmasters/v3/sites";

const refreshToken =
  process.env.GSC_OAUTH_REFRESH_TOKEN || process.env.GA4_OAUTH_REFRESH_TOKEN;

export function gscConfigured(): boolean {
  const oauth = Boolean(
    process.env.GA4_OAUTH_CLIENT_ID && process.env.GA4_OAUTH_CLIENT_SECRET && refreshToken
  );
  const sa = Boolean(
    process.env.GA4_CREDENTIALS_JSON ||
      (process.env.GA4_CLIENT_EMAIL && process.env.GA4_PRIVATE_KEY)
  );
  return oauth || sa;
}

async function accessToken(): Promise<string> {
  if (process.env.GA4_OAUTH_CLIENT_ID && process.env.GA4_OAUTH_CLIENT_SECRET && refreshToken) {
    const oauth = new OAuth2Client(
      process.env.GA4_OAUTH_CLIENT_ID,
      process.env.GA4_OAUTH_CLIENT_SECRET
    );
    oauth.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth.getAccessToken();
    if (!token) throw new Error("GSC: δεν επιστράφηκε access token");
    return token;
  }
  const credentials = process.env.GA4_CREDENTIALS_JSON
    ? JSON.parse(process.env.GA4_CREDENTIALS_JSON)
    : {
        client_email: process.env.GA4_CLIENT_EMAIL,
        private_key: (process.env.GA4_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      };
  const auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("GSC: δεν επιστράφηκε access token");
  return token;
}

export interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  position: number;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Τελευταίες 28 μέρες, μέχρι 2 μέρες πριν (καθυστέρηση δεδομένων GSC). */
export function gscPeriod() {
  const end = new Date(Date.now() - 2 * 86400000);
  const start = new Date(end.getTime() - 27 * 86400000);
  return { start: iso(start), end: iso(end) };
}

interface RawRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}

async function query(
  dimensions: ("query" | "page")[],
  opts: { pageContains?: string; maxRows: number }
): Promise<RawRow[]> {
  const token = await accessToken();
  const { start, end } = gscPeriod();
  const rows: RawRow[] = [];
  const pageSize = 25000;
  for (let startRow = 0; startRow < opts.maxRows; startRow += pageSize) {
    const body: Record<string, unknown> = {
      startDate: start,
      endDate: end,
      dimensions,
      rowLimit: Math.min(pageSize, opts.maxRows - startRow),
      startRow,
      dataState: "all",
    };
    if (opts.pageContains) {
      body.dimensionFilterGroups = [
        {
          filters: [
            { dimension: "page", operator: "contains", expression: opts.pageContains },
          ],
        },
      ];
    }
    const res = await fetch(`${API}/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text();
      const hint =
        res.status === 403
          ? " (ο λογαριασμός δεν έχει πρόσβαση στο property ή λείπει το scope webmasters.readonly)"
          : "";
      let msg = txt;
      try {
        msg = (JSON.parse(txt) as { error?: { message?: string } }).error?.message ?? txt;
      } catch {
        /* όχι JSON */
      }
      // Η τιμή του site ΠΡΩΤΗ, σε JSON (φαίνονται κενά/εισαγωγικά/κρυφοί χαρακτήρες).
      throw new Error(`GSC ${res.status} site=${JSON.stringify(SITE)}${hint}: ${msg.slice(0, 160)}`);
    }
    const json = (await res.json()) as { rows?: RawRow[] };
    const batch = json.rows ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

/**
 * Top queries (28 ημέρες), cache 6 ωρών.
 *
 * Τα tags αφορούν τις ειδήσεις, ενώ το μεγαλύτερο μέρος της αναζήτησης του
 * alphatv.gr είναι σειρές/εκπομπές. Γι' αυτό (εκτός αν SEO_NEWS_ONLY=false)
 * κρατάμε μόνο τα queries που οδηγούν σε σελίδες ειδήσεων (NEWS_PATHS του
 * dashboard) ή σε σελίδες tag.
 */
export function fetchQueries(): Promise<GscRow[]> {
  const newsOnly = process.env.SEO_NEWS_ONLY !== "false";
  return cached(`gsc:queries:${newsOnly}`, 6 * 3600 * 1000, async () => {
    if (!newsOnly) {
      const max = Number(process.env.GSC_MAX_QUERIES || 25000);
      const raw = await query(["query"], { maxRows: max });
      return raw.map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position }));
    }
    const max = Number(process.env.GSC_MAX_QUERY_PAGES || 100000);
    const raw = await query(["query", "page"], { maxRows: max });
    const allowed = [...NEWS_PATHS.filter((p) => p !== "/news/"), "/tag/"];
    const agg = new Map<string, { clicks: number; impressions: number; posSum: number }>();
    for (const r of raw) {
      const path = pathOf(r.keys[1]);
      if (!allowed.some((p) => path.startsWith(p))) continue;
      const a = agg.get(r.keys[0]) ?? { clicks: 0, impressions: 0, posSum: 0 };
      a.clicks += r.clicks;
      a.impressions += r.impressions;
      a.posSum += r.position * r.impressions;
      agg.set(r.keys[0], a);
    }
    return [...agg.entries()]
      .map(([key, a]) => ({
        key,
        clicks: a.clicks,
        impressions: a.impressions,
        position: a.impressions ? a.posSum / a.impressions : 0,
      }))
      .sort((x, y) => y.impressions - x.impressions);
  });
}

/** Απόδοση σελίδων tag (28 ημέρες), cache 6 ωρών. Κλειδί = path. */
export function fetchTagPages(tagBase: string): Promise<GscRow[]> {
  return cached(`gsc:tagpages:${tagBase}`, 6 * 3600 * 1000, async () => {
    const rows = await query(["page"], { pageContains: tagBase, maxRows: 25000 });
    return rows.map((r) => ({
      key: pathOf(r.keys[0]),
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    }));
  });
}
