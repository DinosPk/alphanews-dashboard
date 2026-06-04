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
      // Top ειδήσεις ΤΕΛΕΥΤΑΙΑΣ ΩΡΑΣ — παίρνουμε ανά ώρα και κρατάμε τις 2
      // πιο πρόσφατες ώρες που έχουν δεδομένα (ανθεκτικό σε ζώνη ώρας/καθυστέρηση).
      client.runReport({
        property,
        dateRanges: [{ startDate: "yesterday", endDate: "today" }],
        dimensions: [
          { name: "dateHour" },
          { name: "pageTitle" },
          { name: "pagePath" },
        ],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: newsScope,
        orderBys: [{ dimension: { dimensionName: "dateHour" }, desc: true }],
        limit: 2000,
      }),
      client.runReport({
        property,
        dateRanges: today,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        dimensionFilter: newsScope,
      }),
      // Χώρες σήμερα — εξαιρώντας bots (μέση διάρκεια < 10s = data-center traffic)
      client.runReport({
        property,
        dateRanges: today,
        dimensions: [{ name: "country" }],
        metrics: [
          { name: "activeUsers" },
          { name: "averageSessionDuration" },
        ],
        dimensionFilter: newsScope,
        metricFilter: {
          filter: {
            fieldName: "averageSessionDuration",
            numericFilter: {
              operation: "GREATER_THAN",
              value: { doubleValue: 10 },
            },
          },
        },
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 6,
      }),
    ]);

    // Κράτα μόνο τις 2 πιο πρόσφατες ώρες που έχουν δεδομένα, άθροισε ανά τίτλο.
    const pageRows = pagesRes[0].rows ?? [];
    const recentHours = [
      ...new Set(pageRows.map((r) => r.dimensionValues?.[0]?.value ?? "")),
    ]
      .sort()
      .reverse()
      .slice(0, 2);
    const agg = new Map<string, PageRow>();
    for (const row of pageRows) {
      const hour = row.dimensionValues?.[0]?.value ?? "";
      if (!recentHours.includes(hour)) continue;
      const title = row.dimensionValues?.[1]?.value || "(χωρίς τίτλο)";
      const path = row.dimensionValues?.[2]?.value || undefined;
      const v = num(row.metricValues?.[0]?.value);
      const cur = agg.get(title) ?? { title, path, value: 0 };
      cur.value += v;
      agg.set(title, cur);
    }
    topPages = [...agg.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
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
      // 7 ΟΛΟΚΛΗΡΩΜΕΝΕΣ μέρες (μέχρι χθες) — χωρίς τη μισή σημερινή.
      return {
        current: { startDate: "7daysAgo", endDate: "yesterday" },
        previous: { startDate: "14daysAgo", endDate: "8daysAgo" },
        timeDimension: "date",
      };
    case "30d":
      // 30 ΟΛΟΚΛΗΡΩΜΕΝΕΣ μέρες (μέχρι χθες).
      return {
        current: { startDate: "30daysAgo", endDate: "yesterday" },
        previous: { startDate: "60daysAgo", endDate: "31daysAgo" },
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

// --- Βοηθοί για κυλιόμενο 24ωρο (μορφή dateHour "YYYYMMDDHH") ---
function parseHour(s: string): Date {
  return new Date(
    Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10))
  );
}
function fmtHour(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(
    d.getUTCHours()
  )}`;
}
// Λίστα `count` διαδοχικών ωρών (φθίνουσα) που τελειώνει στο `latest`.
function hoursBack(latest: string, count: number): string[] {
  const base = parseHour(latest).getTime();
  return Array.from({ length: count }, (_, i) =>
    fmtHour(new Date(base - i * 3600000))
  );
}

// Κυλιόμενο 24ωρο: τελευταίες 24 ώρες (με δεδομένα) vs προηγούμενες 24.
async function rolling24h(
  client: BetaAnalyticsDataClient,
  scope: ReturnType<typeof scopeFilter>
): Promise<HistoricalData> {
  const range: RangeKey = "24h";
  const dateRanges = [{ startDate: "3daysAgo", endDate: "today" }];
  const andHours = (hours: string[]) => ({
    andGroup: {
      expressions: [
        scope,
        { filter: { fieldName: "dateHour", inListFilter: { values: hours } } },
      ],
    },
  });

  // Στάδιο 1: ωριαία δεδομένα → βρες τις πιο πρόσφατες ώρες με δεδομένα.
  const [hourlyRes] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: "dateHour" }],
    metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
    dimensionFilter: scope,
    orderBys: [{ dimension: { dimensionName: "dateHour" } }],
    limit: 1000,
  });
  const hourMap = new Map<string, { pv: number; users: number }>();
  for (const row of hourlyRes.rows ?? []) {
    hourMap.set(row.dimensionValues?.[0]?.value ?? "", {
      pv: num(row.metricValues?.[0]?.value),
      users: num(row.metricValues?.[1]?.value),
    });
  }
  const present = [...hourMap.keys()].sort();
  const latest = present[present.length - 1] ?? fmtHour(new Date());
  const all48 = hoursBack(latest, 48);
  const cur24 = all48.slice(0, 24);
  const prev24 = all48.slice(24, 48);
  const cur24Asc = [...cur24].reverse();
  const prev24Asc = [...prev24].reverse();

  // Χρονοσειρά: θέση-θέση, τρέχον vs προηγούμενο 24ωρο.
  const timeseries: TimePoint[] = cur24Asc.map((h, i) => {
    const c = hourMap.get(h);
    return {
      label: h.slice(8, 10) + ":00",
      pageViews: c?.pv ?? 0,
      users: c?.users ?? 0,
      prevPageViews: hourMap.get(prev24Asc[i])?.pv ?? 0,
    };
  });

  // Στάδιο 2: KPIs (τρέχον & προηγούμενο), top άρθρα, πηγές.
  const [kpiCur, kpiPrev, articlesRes, channelsRes] = await Promise.all([
    client.runReport({
      property,
      dateRanges,
      metrics: KPI_METRICS.map((name) => ({ name })),
      dimensionFilter: andHours(cur24),
    }),
    client.runReport({
      property,
      dateRanges,
      metrics: KPI_METRICS.map((name) => ({ name })),
      dimensionFilter: andHours(prev24),
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      dimensionFilter: andHours(cur24),
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: andHours(cur24),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 8,
    }),
  ]);

  const cv = (r: typeof kpiCur, i: number) =>
    num(r[0].rows?.[0]?.metricValues?.[i]?.value);

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
      pageViews: kpiVal(cv(kpiCur, 0), cv(kpiPrev, 0)),
      activeUsers: kpiVal(cv(kpiCur, 1), cv(kpiPrev, 1)),
      sessions: kpiVal(cv(kpiCur, 2), cv(kpiPrev, 2)),
      avgSessionDuration: kpiVal(cv(kpiCur, 3), cv(kpiPrev, 3)),
      engagementRate: kpiVal(cv(kpiCur, 4) * 100, cv(kpiPrev, 4) * 100),
    },
    timeseries,
    topArticles,
    channels,
    demo: false,
    generatedAt: new Date().toISOString(),
  };
}

export async function getHistorical(
  range: RangeKey,
  sectionKey?: string | null
): Promise<HistoricalData> {
  const section = findSection(sectionKey);
  if (!isConfigured()) return mockHistorical(range, sectionKey);
  const client = buildClient();
  if (!client) return mockHistorical(range, sectionKey);

  // Καθολικό scope: μία ενότητα → μόνο αυτή· αλλιώς ΟΛΕΣ οι ειδήσεις.
  // Έτσι το dashboard δεν μετράει ποτέ σειρές/live/ψυχαγωγία.
  const sectionFilter = scopeFilter(section);

  // Το 24ωρο είναι κυλιόμενο (τελευταίες 24 ώρες vs προηγούμενες 24).
  if (range === "24h") {
    try {
      return await rolling24h(client, sectionFilter);
    } catch (err) {
      console.error("[GA4] Σφάλμα κυλιόμενου 24ώρου, γυρνάω demo:", err);
      return mockHistorical(range, sectionKey);
    }
  }

  const dates = rangeDates(range);

  try {
    const [kpiRes, tsRes, tsPrevRes, articlesRes, channelsRes] =
      await Promise.all([
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
      // Χρονοσειρά (τάση) — τρέχουσα περίοδος
      client.runReport({
        property,
        dateRanges: [dates.current],
        dimensions: [{ name: dates.timeDimension }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: dates.timeDimension } }],
        dimensionFilter: sectionFilter,
        limit: 1000,
      }),
      // Χρονοσειρά — ΠΡΟΗΓΟΥΜΕΝΗ περίοδος (για σύγκριση στο γράφημα)
      client.runReport({
        property,
        dateRanges: [dates.previous],
        dimensions: [{ name: dates.timeDimension }],
        metrics: [{ name: "screenPageViews" }],
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

    // Προβολές προηγούμενης περιόδου, σε σειρά (αντιστοίχιση ανά θέση)
    const prevSeries = (tsPrevRes[0].rows ?? []).map((row) =>
      num(row.metricValues?.[0]?.value)
    );
    const timeseries: TimePoint[] = (tsRes[0].rows ?? []).map((row, i) => ({
      label: labelFor(range, row.dimensionValues?.[0]?.value ?? ""),
      pageViews: num(row.metricValues?.[0]?.value),
      users: num(row.metricValues?.[1]?.value),
      prevPageViews: prevSeries[i],
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
