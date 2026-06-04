// Επικοινωνία με το Google Analytics Data API (GA4).
// Αν δεν υπάρχουν credentials, ή αν κάτι αποτύχει, γυρνάμε DEMO δεδομένα
// ώστε το dashboard να μη «σπάει» ποτέ.

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { OAuth2Client, GoogleAuth } from "google-auth-library";
import type {
  RealtimeData,
  HistoricalData,
  RangeKey,
  PageRow,
  ChannelRow,
  TimePoint,
} from "./types";
import { mockRealtime, mockHistorical } from "./mock";
import { findSection, NEWS_PATHS } from "./sections";

// Φίλτρο pagePath «αρχίζει με» (BEGINS_WITH)
function beginsWith(value: string) {
  return {
    filter: {
      fieldName: "pagePath",
      stringFilter: { matchType: "BEGINS_WITH" as const, value },
    },
  };
}

// Καθολικό scope: συγκεκριμένη ενότητα → μόνο αυτή· αλλιώς ΟΛΕΣ οι ειδήσεις.
function scopeFilter(section: { pathContains: string } | null) {
  if (section) return beginsWith(section.pathContains);
  return {
    orGroup: { expressions: NEWS_PATHS.map((p) => beginsWith(p)) },
  };
}

const propertyId = process.env.GA4_PROPERTY_ID;

const hasOAuth = Boolean(
  process.env.GA4_OAUTH_CLIENT_ID &&
    process.env.GA4_OAUTH_CLIENT_SECRET &&
    process.env.GA4_OAUTH_REFRESH_TOKEN
);

const hasServiceAccount = Boolean(
  process.env.GA4_CREDENTIALS_JSON ||
    (process.env.GA4_CLIENT_EMAIL && process.env.GA4_PRIVATE_KEY)
);

function buildClient(): BetaAnalyticsDataClient | null {
  try {
    // Προτεραιότητα: OAuth (σύνδεση με τον λογαριασμό του χρήστη).
    if (hasOAuth) {
      const oauth = new OAuth2Client(
        process.env.GA4_OAUTH_CLIENT_ID,
        process.env.GA4_OAUTH_CLIENT_SECRET
      );
      oauth.setCredentials({
        refresh_token: process.env.GA4_OAUTH_REFRESH_TOKEN,
      });
      // authClient → GoogleAuth (cast για το generic type του gax)
      const auth = new GoogleAuth({ authClient: oauth }) as unknown as GoogleAuth;
      return new BetaAnalyticsDataClient({ auth });
    }

    // Εναλλακτικά: service account.
    const json = process.env.GA4_CREDENTIALS_JSON;
    if (json) {
      return new BetaAnalyticsDataClient({ credentials: JSON.parse(json) });
    }
    const clientEmail = process.env.GA4_CLIENT_EMAIL;
    const privateKey = process.env.GA4_PRIVATE_KEY;
    if (clientEmail && privateKey) {
      return new BetaAnalyticsDataClient({
        credentials: {
          client_email: clientEmail,
          // Στα env vars τα newlines αποθηκεύονται ως \n — τα μετατρέπουμε πίσω.
          private_key: privateKey.replace(/\\n/g, "\n"),
        },
      });
    }
    return null;
  } catch (err) {
    console.error("[GA4] Σφάλμα δημιουργίας client:", err);
    return null;
  }
}

export function isConfigured(): boolean {
  return Boolean(propertyId && (hasOAuth || hasServiceAccount));
}

const property = `properties/${propertyId}`;

const DEVICE_GR: Record<string, string> = {
  mobile: "Κινητό",
  desktop: "Υπολογιστής",
  tablet: "Tablet",
  smart_tv: "Smart TV",
};

const num = (v: string | null | undefined) => Number(v ?? 0) || 0;

// ----------------------------- REAL-TIME -----------------------------

export async function getRealtime(): Promise<RealtimeData> {
  if (!isConfigured()) return mockRealtime();
  const client = buildClient();
  if (!client) return mockRealtime();

  const newsScope = scopeFilter(null);
  const today = [{ startDate: "today", endDate: "today" }];

  // --- Μέρος Α: ΕΙΔΗΣΕΙΣ σήμερα (standard Data API — άφθονο quota, αξιόπιστο) ---
  let topPages: PageRow[];
  let byDevice: { device: string; users: number }[];
  let byCountry: { country: string; users: number }[];
  try {
    const [pagesRes, deviceRes, countryRes] = await Promise.all([
      // Top ειδήσεις σήμερα (φίλτρο path → 100% ειδήσεις)
      client.runReport({
        property,
        dateRanges: today,
        dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: newsScope,
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8,
      }),
      client.runReport({
        property,
        dateRanges: today,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        dimensionFilter: newsScope,
      }),
      client.runReport({
        property,
        dateRanges: today,
        dimensions: [{ name: "country" }],
        metrics: [{ name: "activeUsers" }],
        dimensionFilter: newsScope,
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 6,
      }),
    ]);

    topPages = (pagesRes[0].rows ?? []).map((row) => ({
      title: row.dimensionValues?.[0]?.value || "(χωρίς τίτλο)",
      path: row.dimensionValues?.[1]?.value || undefined,
      value: num(row.metricValues?.[0]?.value),
    }));
    byDevice = (deviceRes[0].rows ?? [])
      .map((row) => ({
        device:
          DEVICE_GR[row.dimensionValues?.[0]?.value ?? ""] ||
          row.dimensionValues?.[0]?.value ||
          "Άλλο",
        users: num(row.metricValues?.[0]?.value),
      }))
      .sort((a, b) => b.users - a.users);
    byCountry = (countryRes[0].rows ?? []).map((row) => ({
      country: row.dimensionValues?.[0]?.value || "(άγνωστη)",
      users: num(row.metricValues?.[0]?.value),
    }));
  } catch (err) {
    console.error("[GA4] Σφάλμα στα today-news, γυρνάω demo:", err);
    return mockRealtime();
  }

  return {
    topPages,
    byDevice,
    byCountry,
    demo: false,
    generatedAt: new Date().toISOString(),
  };
}

// ----------------------------- HISTORICAL -----------------------------

interface RangeDates {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
  timeDimension: "dateHour" | "date";
}

function rangeDates(range: RangeKey): RangeDates {
  switch (range) {
    case "24h":
      return {
        current: { startDate: "today", endDate: "today" },
        previous: { startDate: "yesterday", endDate: "yesterday" },
        timeDimension: "dateHour",
      };
    case "7d":
      return {
        current: { startDate: "6daysAgo", endDate: "today" },
        previous: { startDate: "13daysAgo", endDate: "7daysAgo" },
        timeDimension: "date",
      };
    case "30d":
      return {
        current: { startDate: "29daysAgo", endDate: "today" },
        previous: { startDate: "59daysAgo", endDate: "30daysAgo" },
        timeDimension: "date",
      };
  }
}

const KPI_METRICS = [
  "screenPageViews",
  "activeUsers",
  "sessions",
  "averageSessionDuration",
  "engagementRate",
];

function kpiVal(current: number, previous: number) {
  const changePct =
    previous > 0 ? ((current - previous) / previous) * 100 : null;
  return { current, previous, changePct };
}

function labelFor(range: RangeKey, raw: string): string {
  // dateHour = YYYYMMDDHH ; date = YYYYMMDD
  if (range === "24h") {
    return raw.slice(8, 10) + ":00";
  }
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return `${d}/${m}`;
}

export async function getHistorical(
  range: RangeKey,
  sectionKey?: string | null
): Promise<HistoricalData> {
  const section = findSection(sectionKey);
  if (!isConfigured()) return mockHistorical(range, sectionKey);
  const client = buildClient();
  if (!client) return mockHistorical(range, sectionKey);

  const dates = rangeDates(range);

  // Καθολικό scope: μία ενότητα → μόνο αυτή· αλλιώς ΟΛΕΣ οι ειδήσεις.
  // Έτσι το dashboard δεν μετράει ποτέ σειρές/live/ψυχαγωγία.
  const sectionFilter = scopeFilter(section);

  try {
    const [kpiRes, tsRes, articlesRes, channelsRes] = await Promise.all([
      // KPIs με σύγκριση δύο περιόδων
      client.runReport({
        property,
        dateRanges: [
          { ...dates.current, name: "current" },
          { ...dates.previous, name: "previous" },
        ],
        metrics: KPI_METRICS.map((name) => ({ name })),
        dimensionFilter: sectionFilter,
      }),
      // Χρονοσειρά (τάση)
      client.runReport({
        property,
        dateRanges: [dates.current],
        dimensions: [{ name: dates.timeDimension }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: dates.timeDimension } }],
        dimensionFilter: sectionFilter,
        limit: 1000,
      }),
      // Top άρθρα
      client.runReport({
        property,
        dateRanges: [dates.current],
        dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        dimensionFilter: sectionFilter,
        limit: 10,
      }),
      // Πηγές επισκεψιμότητας
      client.runReport({
        property,
        dateRanges: [dates.current],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        dimensionFilter: sectionFilter,
        limit: 8,
      }),
    ]);

    // --- KPIs: δύο γραμμές, μία ανά dateRange ---
    const cur = new Array(KPI_METRICS.length).fill(0);
    const prev = new Array(KPI_METRICS.length).fill(0);
    for (const row of kpiRes[0].rows ?? []) {
      // Με >1 dateRanges το API προσθέτει dimension "dateRange" με την τιμή
      // του ονόματος που δώσαμε ("current"/"previous").
      const drVal = row.dimensionValues?.[0]?.value ?? "";
      const target =
        drVal === "current" || drVal.endsWith("0") ? cur : prev;
      (row.metricValues ?? []).forEach((mv, i) => {
        target[i] = num(mv.value);
      });
    }

    const timeseries: TimePoint[] = (tsRes[0].rows ?? []).map((row) => ({
      label: labelFor(range, row.dimensionValues?.[0]?.value ?? ""),
      pageViews: num(row.metricValues?.[0]?.value),
      users: num(row.metricValues?.[1]?.value),
    }));

    const topArticles: PageRow[] = (articlesRes[0].rows ?? []).map((row) => ({
      title: row.dimensionValues?.[0]?.value || "(χωρίς τίτλο)",
      path: row.dimensionValues?.[1]?.value || undefined,
      value: num(row.metricValues?.[0]?.value),
    }));

    const rawChannels = (channelsRes[0].rows ?? []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || "(άλλο)",
      sessions: num(row.metricValues?.[0]?.value),
    }));
    const chTotal = rawChannels.reduce((a, b) => a + b.sessions, 0) || 1;
    const channels: ChannelRow[] = rawChannels.map((c) => ({
      ...c,
      share: (c.sessions / chTotal) * 100,
    }));

    return {
      range,
      kpis: {
        pageViews: kpiVal(cur[0], prev[0]),
        activeUsers: kpiVal(cur[1], prev[1]),
        sessions: kpiVal(cur[2], prev[2]),
        avgSessionDuration: kpiVal(cur[3], prev[3]),
        // engagementRate έρχεται ως αναλογία 0-1 → ποσοστό
        engagementRate: kpiVal(cur[4] * 100, prev[4] * 100),
      },
      timeseries,
      topArticles,
      channels,
      demo: false,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[GA4] Σφάλμα historical, γυρνάω demo:", err);
    return mockHistorical(range, sectionKey);
  }
}
