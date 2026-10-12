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

const SITE = process.env.GSC_SITE_URL || "sc-domain:alphatv.gr";
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

async function query(
  dimension: "query" | "page",
  opts: { pageContains?: string; maxRows: number }
): Promise<GscRow[]> {
  const token = await accessToken();
  const { start, end } = gscPeriod();
  const rows: GscRow[] = [];
  const pageSize = 25000;
  for (let startRow = 0; startRow < opts.maxRows; startRow += pageSize) {
    const body: Record<string, unknown> = {
      startDate: start,
      endDate: end,
      dimensions: [dimension],
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
      throw new Error(`GSC ${res.status}${hint}: ${txt.slice(0, 160)}`);
    }
    const json = (await res.json()) as {
      rows?: { keys: string[]; clicks: number; impressions: number; position: number }[];
    };
    const batch = json.rows ?? [];
    for (const r of batch) {
      rows.push({
        key: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      });
    }
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** Top queries (28 ημέρες), cache 6 ωρών. */
export function fetchQueries(): Promise<GscRow[]> {
  const max = Number(process.env.GSC_MAX_QUERIES || 25000);
  return cached("gsc:queries", 6 * 3600 * 1000, () => query("query", { maxRows: max }));
}

/** Απόδοση σελίδων tag (28 ημέρες), cache 6 ωρών. Κλειδί = path. */
export function fetchTagPages(tagBase: string): Promise<GscRow[]> {
  return cached(`gsc:tagpages:${tagBase}`, 6 * 3600 * 1000, async () => {
    const rows = await query("page", { pageContains: tagBase, maxRows: 25000 });
    return rows.map((r) => {
      try {
        return { ...r, key: new URL(r.key).pathname };
      } catch {
        return r;
      }
    });
  });
}
