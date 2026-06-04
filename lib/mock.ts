// Παραγωγή ρεαλιστικών DEMO δεδομένων όταν δεν υπάρχουν credentials GA4.
// Έτσι ο αρχισυντάκτης βλέπει αμέσως πώς δουλεύει το dashboard.

import type {
  RealtimeData,
  HistoricalData,
  RangeKey,
  PageRow,
  TimePoint,
} from "./types";

const ARTICLES: string[] = [
  "Έκτακτο: Ραγδαίες εξελίξεις στο πολιτικό σκηνικό",
  "Καιρός: Έρχεται νέο κύμα κακοκαιρίας — πού θα χτυπήσει",
  "Οικονομία: Τι αλλάζει στους λογαριασμούς ρεύματος",
  "Αθλητικά: Η μεγάλη ανατροπή στο ντέρμπι της Κυριακής",
  "Υγεία: Οι οδηγίες των ειδικών για την εποχική γρίπη",
  "Διεθνή: Κλιμακώνεται η ένταση — οι τελευταίες πληροφορίες",
  "Lifestyle: Η συνέντευξη που συζητήθηκε όλη την ημέρα",
  "Τεχνολογία: Τα νέα μέτρα για την τεχνητή νοημοσύνη",
  "Κοινωνία: Τι ισχύει για τις μετακινήσεις από αύριο",
  "Ελλάδα: Μεγάλη αστυνομική επιχείρηση στο κέντρο",
  "Αυτοκίνητο: Οι αλλαγές στα διόδια από την 1η του μήνα",
  "Ψυχαγωγία: Όλα όσα έγιναν στη μεγάλη πρεμιέρα",
];

const COUNTRIES = ["Ελλάδα", "Γερμανία", "ΗΠΑ", "Κύπρος", "Ηνωμένο Βασίλειο", "Αυστραλία"];
const CHANNELS = [
  "Organic Search",
  "Direct",
  "Social",
  "Referral",
  "Organic Video",
  "Email",
];

// Ντετερμινιστική «τυχαιότητα» βασισμένη σε seed, ώστε τα νούμερα να μη χοροπηδάνε ανούσια.
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

export function mockRealtime(): RealtimeData {
  // Seed ανά ~20" ώστε τα νούμερα να αλλάζουν σε κάθε ανανέωση (φαίνονται τα spikes).
  const seed = Math.floor(Date.now() / 20000);
  const rnd = seeded(seed);

  const shuffled = [...ARTICLES].sort(() => rnd() - 0.5).slice(0, 8);
  const topPages: PageRow[] = shuffled
    .map((title) => ({
      title,
      path: "/news/" + Math.floor(rnd() * 90000 + 10000),
      value: Math.floor(rnd() * 600 + 40),
    }))
    .sort((a, b) => b.value - a.value);

  const total = topPages.reduce((a, b) => a + b.value, 0);
  const mobile = Math.floor(total * (0.62 + rnd() * 0.08));
  const desktop = Math.floor((total - mobile) * 0.8);
  const tablet = Math.max(0, total - mobile - desktop);

  const byCountry = COUNTRIES.map((country) => ({
    country,
    users: Math.floor(rnd() * 100),
  }))
    .sort((a, b) => b.users - a.users)
    .map((r, i) => (i === 0 ? { ...r, users: Math.floor(total * 0.5) } : r));

  return {
    topPages,
    byDevice: [
      { device: "Κινητό", users: mobile },
      { device: "Υπολογιστής", users: desktop },
      { device: "Tablet", users: tablet },
    ],
    byCountry,
    demo: true,
    generatedAt: new Date().toISOString(),
  };
}

function rangeConfig(range: RangeKey) {
  switch (range) {
    case "24h":
      return { points: 24, unit: "hour" as const, base: 4200 };
    case "7d":
      return { points: 7, unit: "day" as const, base: 95000 };
    case "30d":
      return { points: 30, unit: "day" as const, base: 92000 };
  }
}

function kpi(current: number, previous: number) {
  const changePct =
    previous > 0 ? ((current - previous) / previous) * 100 : null;
  return { current, previous, changePct };
}

export function mockHistorical(
  range: RangeKey,
  sectionKey?: string | null
): HistoricalData {
  const cfg = rangeConfig(range);
  const daySeed = Math.floor(Date.now() / 3600000);
  // Η ενότητα μεταβάλλει το seed (διαφορετικά νούμερα) και μειώνει τον όγκο.
  const hasSection = Boolean(sectionKey && sectionKey !== "all");
  const sectionSeed = (sectionKey ?? "all")
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  const sectionScale = hasSection ? 0.18 + (sectionSeed % 5) * 0.06 : 1;
  const rnd = seeded(daySeed + range.length + sectionSeed);

  const timeseries: TimePoint[] = Array.from({ length: cfg.points }, (_, i) => {
    let label: string;
    if (cfg.unit === "hour") {
      label = `${String(i).padStart(2, "0")}:00`;
    } else if (range === "7d") {
      label = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"][i % 7];
    } else {
      label = `${i + 1}`;
    }
    const daypart = cfg.unit === "hour" ? 0.5 + Math.sin((i - 6) / 4) * 0.5 : 1;
    const pageViews = Math.floor(
      cfg.base * sectionScale * (0.7 + rnd() * 0.6) * daypart
    );
    const users = Math.floor(pageViews * (0.45 + rnd() * 0.1));
    return { label, pageViews, users };
  });

  const totalPV = timeseries.reduce((a, b) => a + b.pageViews, 0);
  const totalUsers = timeseries.reduce((a, b) => a + b.users, 0);
  const sessions = Math.floor(totalUsers * 1.35);

  // «Προηγούμενη περίοδος» — λίγο χαμηλότερα/υψηλότερα τυχαία.
  const factor = 0.82 + rnd() * 0.3;

  const topArticles: PageRow[] = [...ARTICLES]
    .sort(() => rnd() - 0.5)
    .slice(0, 10)
    .map((title) => ({
      title,
      path: "/news/" + Math.floor(rnd() * 90000 + 10000),
      value: Math.floor(rnd() * (totalPV / 8) + totalPV / 40),
    }))
    .sort((a, b) => b.value - a.value);

  const rawChannels = CHANNELS.map((channel) => ({
    channel,
    sessions: Math.floor(rnd() * sessions * 0.4 + sessions * 0.05),
  }));
  const chTotal = rawChannels.reduce((a, b) => a + b.sessions, 0);
  const channels = rawChannels
    .map((c) => ({ ...c, share: (c.sessions / chTotal) * 100 }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    range,
    kpis: {
      pageViews: kpi(totalPV, Math.floor(totalPV * factor)),
      activeUsers: kpi(totalUsers, Math.floor(totalUsers * factor)),
      sessions: kpi(sessions, Math.floor(sessions * factor)),
      avgSessionDuration: kpi(
        Math.floor(95 + rnd() * 60),
        Math.floor(95 + rnd() * 60)
      ),
      engagementRate: kpi(
        Math.floor(52 + rnd() * 20),
        Math.floor(52 + rnd() * 20)
      ),
    },
    timeseries,
    topArticles,
    channels,
    demo: true,
    generatedAt: new Date().toISOString(),
  };
}
