// Η «λογική» του SEO Tags module: audit, demand gap, πρόταση tags, trends.
// Όλα δουλεύουν πάνω σε ένα κοινό context (tags + GSC queries + GA4 views)
// που φορτώνεται μία φορά και κρατιέται στη cache.

import type {
  WpTag,
  AuditData,
  AuditTag,
  DuplicateGroup,
  GapData,
  GapRow,
  SuggestData,
  SuggestedTag,
  TrendingData,
  TrendItem,
  SourceStatus,
  TagAction,
} from "./types";
import {
  exactKey,
  fuzzyKey,
  fuzzyTokens,
  containsPhrase,
  ngrams,
  properNounPhrases,
  displayCase,
  accentScore,
} from "./normalize";
import { fetchAllTags, tagBasePath, fetchArticleByUrl, type TagSource } from "./wordpress";
import { fetchQueries, fetchTagPages, gscConfigured, gscPeriod, type GscRow } from "./gsc";
import { fetchTrends } from "./trends";
import { getTagPageViews } from "../ga4";
import { cached } from "./cache";
import { MOCK_TAGS, MOCK_QUERIES, MOCK_TRENDS } from "./mock";

// ---------------------------- Ρυθμίσεις ----------------------------
const HUB_MIN_POSTS = Number(process.env.SEO_HUB_MIN_POSTS || 20);
const HUB_MIN_DEMAND = Number(process.env.SEO_HUB_MIN_DEMAND || 5000);
const THIN_MAX_POSTS = 4;
const THIN_MAX_VIEWS = 50;
const BRAND_TERMS = (process.env.SEO_BRAND_TERMS || "alpha,alfa,alphatv,alphanews,άλφα,αλφα,alpha news")
  .split(",")
  .map((t) => exactKey(t))
  .filter(Boolean);

// ---------------------------- Context ----------------------------

interface IndexedTag extends WpTag {
  exact: string;
  fuzzy: string;
  tokens: string[];
}

interface IndexedQuery extends GscRow {
  tokens: string[];
}

interface Context {
  tags: IndexedTag[];
  /** fuzzy πρώτο token → tags που ξεκινούν με αυτό (για γρήγορο phrase matching) */
  byFirstToken: Map<string, IndexedTag[]>;
  byFuzzy: Map<string, IndexedTag[]>;
  queries: IndexedQuery[];
  tagBase: string;
  gscPages: Map<string, GscRow>;
  ga4Views: Map<string, { views: number; title: string }> | null;
  /** false όταν τα tags ήρθαν από το sitemap (χωρίς πλήθος άρθρων) */
  hasCounts: boolean;
  sources: SourceStatus;
  demo: boolean;
}

/** Πλήθος άρθρων για ταξινόμηση (0 όταν είναι άγνωστο). */
const cnt = (t: { count: number | null }) => t.count ?? 0;

/**
 * Όνομα tag από τον <title> της σελίδας tag: «ΦΩΤΙΑ - Alpha News»,
 * «Alpha News | ΦΩΤΙΑ», «Αρχεία ΦΩΤΙΑ», «Fotia Archives - Σελίδα 2» → «ΦΩΤΙΑ».
 * Πετάει τα κομμάτια που είναι μόνο brand· αν δεν μείνει τίποτα → "" (κρατάμε το slug).
 */
const BRAND_TITLE = new Set(
  ["alpha news", "alphanews", "alpha tv", "alphatv", "alpha", "alphatv gr", "alpha tv gr", "αλφα", "άλφα"].map(
    (b) => exactKey(b)
  )
);
function cleanTagTitle(title: string): string {
  const parts = title
    .split(/\s+[|–—-]\s+|\s*\|\s*/)
    .map((p) =>
      p
        .replace(/^(Αρχεία|Ετικέτα|Tag)\s*:?\s*/i, "")
        .replace(/\s+(Archives|Αρχεία)$/i, "")
        .replace(/\s*(Σελίδα|Page)\s+\d+.*$/i, "")
        .trim()
    )
    .filter((p) => p && !BRAND_TITLE.has(exactKey(p)));
  return parts[0] ?? "";
}

function errMsg(e: unknown) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 400);
}

function indexTags(raw: WpTag[]) {
  const tags: IndexedTag[] = raw
    .filter((t) => t.name)
    .map((t) => ({ ...t, exact: exactKey(t.name), fuzzy: fuzzyKey(t.name), tokens: fuzzyTokens(t.name) }));
  const byFirstToken = new Map<string, IndexedTag[]>();
  const byFuzzy = new Map<string, IndexedTag[]>();
  for (const t of tags) {
    if (!t.tokens.length) continue;
    const arr = byFirstToken.get(t.tokens[0]) ?? [];
    arr.push(t);
    byFirstToken.set(t.tokens[0], arr);
    const f = byFuzzy.get(t.fuzzy) ?? [];
    f.push(t);
    byFuzzy.set(t.fuzzy, f);
  }
  return { tags, byFirstToken, byFuzzy };
}

async function buildContext(): Promise<Context> {
  const sources: SourceStatus = { wordpress: "ok", gsc: "ok", ga4: "ok", errors: {} };

  let src: TagSource | null = null;
  let rawTags: WpTag[];
  let demo = false;
  try {
    src = await fetchAllTags();
    rawTags = src.tags;
    if (src.source === "sitemap") {
      sources.wordpress = "sitemap";
      if (src.restError) sources.errors!.wordpress = `REST API: ${src.restError} — χρησιμοποιείται το sitemap`;
    }
  } catch (e) {
    // Χωρίς tags δεν έχει νόημα τίποτα → πλήρες DEMO (όχι ανάμειξη).
    rawTags = MOCK_TAGS;
    demo = true;
    sources.errors!.wordpress = errMsg(e);
  }
  const tagBase = tagBasePath(rawTags);

  let queries: GscRow[] = [];
  let gscPages = new Map<string, GscRow>();
  let ga4Views: Context["ga4Views"] = null;

  if (demo) {
    sources.wordpress = sources.gsc = sources.ga4 = "demo";
    queries = MOCK_QUERIES;
  } else {
    if (!gscConfigured()) {
      sources.gsc = "not-configured";
    } else {
      try {
        const [q, p] = await Promise.all([fetchQueries(), fetchTagPages(tagBase)]);
        queries = q;
        gscPages = new Map(p.map((r) => [r.key.replace(/\/?$/, "/"), r]));
      } catch (e) {
        sources.gsc = "error";
        sources.errors!.gsc = errMsg(e);
      }
    }
    try {
      ga4Views = await getTagPageViews(tagBase);
      if (!ga4Views) sources.ga4 = "not-configured";
    } catch (e) {
      sources.ga4 = "error";
      sources.errors!.ga4 = errMsg(e);
    }
  }

  // Tags από sitemap: ονόματα από τον τίτλο της σελίδας στο GA4 (αλλιώς το slug).
  if (src?.source === "sitemap" && ga4Views) {
    rawTags = rawTags.map((t) => {
      const title = cleanTagTitle(ga4Views!.get(t.path.replace(/\/?$/, "/"))?.title ?? "");
      return title ? { ...t, name: title } : t;
    });
  }

  const idx = indexTags(rawTags);
  return {
    ...idx,
    queries: queries
      .filter((q) => !BRAND_TERMS.some((b) => exactKey(q.key).includes(b)))
      .map((q) => ({ ...q, tokens: fuzzyTokens(q.key) })),
    tagBase,
    gscPages,
    ga4Views,
    hasCounts: demo || src?.source === "rest",
    sources,
    demo,
  };
}

function getContext(): Promise<Context> {
  return cached("seo:context", 15 * 60 * 1000, buildContext);
}

/** Tags που εμφανίζονται ως φράση μέσα σε μια σειρά από tokens. */
function tagsInTokens(ctx: Context, tokens: string[]): Map<IndexedTag, number> {
  const hits = new Map<IndexedTag, number>();
  for (let i = 0; i < tokens.length; i++) {
    const cands = ctx.byFirstToken.get(tokens[i]);
    if (!cands) continue;
    for (const t of cands) {
      let ok = i + t.tokens.length <= tokens.length;
      for (let j = 1; ok && j < t.tokens.length; j++) ok = tokens[i + j] === t.tokens[j];
      if (ok) hits.set(t, (hits.get(t) ?? 0) + 1);
    }
  }
  return hits;
}

/** Ζήτηση (impressions) ανά tag: queries που περιέχουν το tag ως φράση. Cache. */
const demandMemo = new WeakMap<Context, Map<number, { impressions: number; clicks: number }>>();
function tagDemand(ctx: Context): Map<number, { impressions: number; clicks: number }> {
  const memo = demandMemo.get(ctx);
  if (memo) return memo;
  const out = new Map<number, { impressions: number; clicks: number }>();
  for (const q of ctx.queries) {
    for (const t of tagsInTokens(ctx, q.tokens).keys()) {
      const d = out.get(t.id) ?? { impressions: 0, clicks: 0 };
      d.impressions += q.impressions;
      d.clicks += q.clicks;
      out.set(t.id, d);
    }
  }
  demandMemo.set(ctx, out);
  return out;
}

/** Ζήτηση για ελεύθερη φράση (όχι tag). */
function phraseDemand(ctx: Context, phrase: string): number {
  const needle = fuzzyTokens(phrase);
  if (!needle.length) return 0;
  let sum = 0;
  for (const q of ctx.queries) if (containsPhrase(q.tokens, needle)) sum += q.impressions;
  return sum;
}

const isAllCaps = (name: string) => {
  const letters = name.replace(/[^\p{L}]/gu, "");
  return letters.length > 4 && letters === letters.toLocaleUpperCase("el") && /\p{Lu}/u.test(letters);
};

const plain = (t: IndexedTag): WpTag => ({
  id: t.id,
  name: t.name,
  slug: t.slug,
  count: t.count,
  path: t.path,
  lastmod: t.lastmod,
});

const DAY = 86400000;
const daysSince = (iso?: string) => (iso ? (Date.now() - Date.parse(iso)) / DAY : null);

// ---------------------------- 1. AUDIT ----------------------------

export async function getAudit(): Promise<AuditData> {
  const ctx = await getContext();
  const demand = tagDemand(ctx);

  const perfOf = (t: IndexedTag) => {
    const key = t.path.replace(/\/?$/, "/");
    const g = ctx.gscPages.get(key);
    return {
      clicks: g?.clicks ?? 0,
      impressions: g?.impressions ?? 0,
      position: g ? Math.round(g.position * 10) / 10 : null,
      views: ctx.ga4Views?.get(key)?.views ?? 0,
    };
  };
  const strength = (t: IndexedTag) => {
    const p = perfOf(t);
    return cnt(t) * 10 + p.clicks + p.views / 20;
  };

  // --- Διπλότυπα: πρώτα exact, μετά fuzzy ανάμεσα στους «νικητές» ---
  const duplicates: DuplicateGroup[] = [];
  const mergeTarget = new Map<number, { into: IndexedTag; kind: "exact" | "fuzzy" }>();

  const byExact = new Map<string, IndexedTag[]>();
  for (const t of ctx.tags) {
    const a = byExact.get(t.exact) ?? [];
    a.push(t);
    byExact.set(t.exact, a);
  }
  const exactWinners: IndexedTag[] = [];
  for (const group of byExact.values()) {
    const sorted = [...group].sort((a, b) => strength(b) - strength(a));
    exactWinners.push(sorted[0]);
    if (sorted.length > 1) {
      duplicates.push({ kind: "exact", canonical: plain(sorted[0]), members: sorted.slice(1).map(plain) });
      for (const m of sorted.slice(1)) mergeTarget.set(m.id, { into: sorted[0], kind: "exact" });
    }
  }
  const byFuzzy = new Map<string, IndexedTag[]>();
  for (const t of exactWinners) {
    if (t.fuzzy.replace(/\s/g, "").length < 3) continue;
    const a = byFuzzy.get(t.fuzzy) ?? [];
    a.push(t);
    byFuzzy.set(t.fuzzy, a);
  }
  for (const group of byFuzzy.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => strength(b) - strength(a));
    duplicates.push({ kind: "fuzzy", canonical: plain(sorted[0]), members: sorted.slice(1).map(plain) });
    for (const m of sorted.slice(1)) mergeTarget.set(m.id, { into: sorted[0], kind: "fuzzy" });
  }
  // Σύντομη μορφή πλήρους tag: «Σαμαράς» ⊂ «Αντώνης Σαμαράς». Δεν αλλάζει
  // την ενέργεια του tag (μπορεί να είναι νόμιμα διαφορετικό), μόνο για έλεγχο.
  const fuzzyWinners = exactWinners.filter((t) => !mergeTarget.has(t.id));
  const multi = fuzzyWinners.filter((t) => t.tokens.length >= 2 && t.tokens.length <= 3);
  for (const t of fuzzyWinners) {
    if (t.tokens.length !== 1 || t.tokens[0].length < 4) continue;
    const longer = multi.filter((m) => m.tokens[m.tokens.length - 1] === t.tokens[0]);
    if (longer.length !== 1) continue; // αμφίσημο («Ελλάδας») → όχι
    duplicates.push({ kind: "subset", canonical: plain(longer[0]), members: [plain(t)] });
  }
  const kindOrder = { exact: 0, fuzzy: 1, subset: 2 } as const;
  duplicates.sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      b.members.reduce((s, m) => s + cnt(m), 0) - a.members.reduce((s, m) => s + cnt(m), 0)
  );

  // --- Απόφαση ανά tag ---
  let orphans = 0;
  let thin = 0;
  let caps = 0;
  let hubs = 0;
  const tags: AuditTag[] = ctx.tags.map((t) => {
    const perf = perfOf(t);
    const dem = demand.get(t.id)?.impressions ?? 0;
    const allCaps = isAllCaps(t.name);
    if (allCaps) caps++;
    let action: TagAction = "keep";
    let reason = "Εντάξει";
    let mergeInto: AuditTag["mergeInto"];

    const noTraffic = perf.clicks === 0 && perf.views < THIN_MAX_VIEWS;
    const age = daysSince(t.lastmod);
    const isOrphan = t.count !== null && t.count <= 1;
    // Χωρίς πλήθος άρθρων (sitemap): thin = καμία κίνηση & κανένα νέο άρθρο εδώ και 6 μήνες.
    const isThin =
      !isOrphan &&
      noTraffic &&
      (t.count !== null ? t.count <= THIN_MAX_POSTS : age !== null && age > 180);
    const isHub =
      t.count !== null
        ? t.count >= HUB_MIN_POSTS && (dem >= HUB_MIN_DEMAND || perf.clicks >= 100)
        : // Χωρίς πλήθος άρθρων: ζήτηση στο Google + ενεργό θέμα (νέο άρθρο τον τελευταίο μήνα)
          dem >= HUB_MIN_DEMAND && ((age !== null && age <= 30) || perf.clicks >= 100 || perf.views >= 1000);
    if (isOrphan) orphans++;
    if (isThin) thin++;

    const merge = mergeTarget.get(t.id);
    if (merge) {
      action = "merge";
      mergeInto = { id: merge.into.id, name: merge.into.name, path: merge.into.path };
      reason =
        merge.kind === "exact"
          ? `Ίδιο με «${merge.into.name}» (διαφέρει μόνο σε κεφαλαία/τόνους)`
          : `Πιθανό διπλότυπο του «${merge.into.name}» (πτώση/πληθυντικός/greeklish) — έλεγξε`;
    } else if (isOrphan) {
      action = "noindex";
      reason = t.count === 0 ? "Χωρίς άρθρα — διαγραφή" : "Μόνο 1 άρθρο — noindex ή διαγραφή";
    } else if (isThin) {
      action = "noindex";
      reason =
        t.count !== null
          ? `${t.count} άρθρα, καμία κίνηση από Google — noindex μέχρι να μεγαλώσει`
          : `Κανένα νέο άρθρο εδώ και ${Math.round(age ?? 0)} ημέρες και καμία κίνηση — noindex`;
    } else if (isHub) {
      action = "hub";
      hubs++;
      reason =
        (t.count !== null
          ? `${t.count} άρθρα & ζήτηση ${dem.toLocaleString("el-GR")} impressions`
          : `Ζήτηση ${dem.toLocaleString("el-GR")} impressions στο Google` +
            (age !== null && age <= 30 ? ` & νέο άρθρο πριν ${Math.max(0, Math.round(age))} ημ.` : "")) +
        " — κάν' το topic hub (intro κείμενο, H1, evergreen)";
    } else if (allCaps) {
      action = "fix-case";
      reason = "Όνομα ΟΛΟ ΚΕΦΑΛΑΙΑ — εμφανίζεται έτσι στο H1/title της σελίδας";
    }
    if (allCaps && action === "hub") reason += " · διόρθωσε και τα ΚΕΦΑΛΑΙΑ";

    return { ...plain(t), perf, demand: dem, action, reason, mergeInto };
  });

  const order: Record<TagAction, number> = { merge: 0, hub: 1, noindex: 2, "fix-case": 3, keep: 4 };
  tags.sort(
    (a, b) =>
      order[a.action] - order[b.action] ||
      cnt(b) - cnt(a) ||
      b.perf.views + b.perf.clicks * 20 - (a.perf.views + a.perf.clicks * 20)
  );

  return {
    totals: {
      tags: tags.length,
      orphans: ctx.hasCounts ? orphans : null,
      thin,
      duplicateGroups: duplicates.filter((d) => d.kind !== "subset").length,
      capsInconsistent: caps,
      hubs,
    },
    duplicates,
    tags,
    sources: ctx.sources,
    demo: ctx.demo,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------- 2. DEMAND GAP ----------------------------

const gapMemo = new WeakMap<Context, GapRow[]>();

function computeGapRows(ctx: Context): GapRow[] {
  const memo = gapMemo.get(ctx);
  if (memo) return memo;

  type Agg = {
    impressions: number;
    clicks: number;
    queries: number;
    examples: { q: string; imp: number }[];
    surfaces: Map<string, number>;
  };
  const agg = new Map<string, Agg>();
  for (const q of ctx.queries) {
    const seen = new Set<string>();
    for (const g of ngrams(q.key, 3)) {
      if (seen.has(g.key)) continue;
      seen.add(g.key);
      const a: Agg = agg.get(g.key) ?? { impressions: 0, clicks: 0, queries: 0, examples: [], surfaces: new Map() };
      a.impressions += q.impressions;
      a.clicks += q.clicks;
      a.queries++;
      a.examples.push({ q: q.key, imp: q.impressions });
      a.surfaces.set(g.surface, (a.surfaces.get(g.surface) ?? 0) + q.impressions);
      agg.set(g.key, a);
    }
  }

  // Εκτός gap: όροι που είναι ήδη tag (ίδιο fuzzy key) ή κομμάτι υπάρχοντος
  // tag («μουντιαλ» ⊂ «ΜΟΥΝΤΙΑΛ 2026», «σαμαρας» ⊂ «Αντώνης Σαμαράς»).
  const coveredByTag = (term: string) => {
    if (ctx.byFuzzy.has(fuzzyKey(term))) return true;
    const toks = fuzzyTokens(term);
    return ctx.tags.some((t) => t.tokens.length >= toks.length && containsPhrase(t.tokens, toks) > 0);
  };
  const candidates = [...agg.entries()]
    .filter(([, a]) => a.queries >= 2 || a.impressions >= 1000)
    .sort((x, y) => y[1].impressions - x[1].impressions || y[0].split(" ").length - x[0].split(" ").length);

  // Επικαλύψεις («επιδομα» / «επιδομα θερμανσης»): κράτα τη μεγαλύτερη φράση
  // όταν έχει ≥80% της ζήτησης της μικρότερης, αλλιώς τη μικρότερη.
  const chosen: [string, Agg][] = [];
  for (const [term, a] of candidates) {
    if (chosen.length >= 150) break;
    if (coveredByTag(term)) continue;
    const words = term.split(" ").length;
    // Επικάλυψη = κοινή λέξη που δεν είναι αριθμός ούτε ήδη tag από μόνη της
    // («θερμανσης» ενώνει «επιδομα θερμανσης» & «θερμανσης 2026», ενώ το
    // «παοκ» δεν ενώνει «αεκ παοκ» & «παοκ καλαματα»).
    const sig = (t: string) =>
      t.split(" ").filter((w) => !/^\d+$/.test(w) && !ctx.byFuzzy.has(fuzzyKey(w)));
    const mine = new Set(sig(term));
    const i = chosen.findIndex(([c]) => sig(c).some((w) => mine.has(w)));
    if (i === -1) {
      chosen.push([term, a]);
    } else {
      const [c, ca] = chosen[i];
      if (words > c.split(" ").length && a.impressions >= ca.impressions * 0.8) chosen[i] = [term, a];
    }
  }

  const rows: GapRow[] = chosen.map(([, a]) => {
    // Γραφή για εμφάνιση: προτίμησε τη μορφή με τόνους.
    const surface = [...a.surfaces.entries()].sort(
      (x, y) => accentScore(y[0]) - accentScore(x[0]) || y[1] - x[1]
    )[0][0];
    return {
      term: displayCase(surface),
      impressions: a.impressions,
      clicks: a.clicks,
      queries: a.queries,
      examples: a.examples.sort((x, y) => y.imp - x.imp).slice(0, 3).map((e) => e.q),
    };
  });
  gapMemo.set(ctx, rows);
  return rows;
}

export async function getGap(): Promise<GapData> {
  const ctx = await getContext();
  const demand = tagDemand(ctx);
  const rows = computeGapRows(ctx);

  // Ένα tag ανά ομάδα διπλοτύπων (το ισχυρότερο), αλλιώς τα «ΦΩΤΙΑ»/«Φωτιά» διπλασιάζονται.
  const bestByFuzzy = new Map<string, IndexedTag>();
  for (const t of ctx.tags) {
    const b = bestByFuzzy.get(t.fuzzy);
    if (!b || cnt(t) > cnt(b)) bestByFuzzy.set(t.fuzzy, t);
  }
  const topTags = [...bestByFuzzy.values()]
    .map((t) => ({ name: t.name, path: t.path, count: t.count, demand: demand.get(t.id)?.impressions ?? 0 }))
    .filter((t) => t.demand > 0)
    .sort((a, b) => b.demand - a.demand)
    .slice(0, 30);

  return {
    rows,
    topTags,
    period: gscPeriod(),
    sources: ctx.sources,
    demo: ctx.demo,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------- 3. ΠΡΟΤΑΣΗ TAGS ----------------------------

async function trendKeys(ctx: Context): Promise<string[][]> {
  try {
    const items = ctx.demo ? MOCK_TRENDS : await fetchTrends();
    return items.map((i) => fuzzyTokens(i.title));
  } catch {
    return [];
  }
}

export async function suggestTags(input: { title?: string; text?: string; url?: string }): Promise<SuggestData> {
  const ctx = await getContext();
  let title = (input.title || "").trim();
  let text = (input.text || "").trim();
  let current: string[] | undefined;

  if (input.url && !ctx.demo) {
    const art = await fetchArticleByUrl(input.url, ctx.tagBase);
    if (!art) throw new Error("Δεν βρέθηκε άρθρο σε αυτό το URL");
    title = art.title;
    text = art.text;
    current = art.tags.map((t) => t.name);
  }
  if (!title && !text) throw new Error("Δώσε τίτλο/κείμενο ή URL άρθρου");

  const titleTok = fuzzyTokens(title);
  const bodyTok = fuzzyTokens(text);
  const trends = await trendKeys(ctx);
  const isTrending = (toks: string[]) =>
    trends.some((tr) => containsPhrase(tr, toks) > 0 || containsPhrase(toks, tr) > 0);

  const demand = tagDemand(ctx);
  // «Δημοφιλία» tag: πλήθος άρθρων, ή (χωρίς πλήθος) προβολές της σελίδας tag.
  const pop = (t: IndexedTag) =>
    t.count ?? Math.round((ctx.ga4Views?.get(t.path.replace(/\/?$/, "/"))?.views ?? 0) / 50);
  const inTitle = tagsInTokens(ctx, titleTok);
  const inBody = tagsInTokens(ctx, bodyTok);

  // --- Υπάρχοντα tags ---
  const seenGroup = new Map<string, SuggestedTag>();
  for (const t of new Set([...inTitle.keys(), ...inBody.keys()])) {
    if (t.exact.length < 3) continue;
    const th = inTitle.get(t) ?? 0;
    const bh = inBody.get(t) ?? 0;
    const dem = demand.get(t.id)?.impressions ?? 0;
    const score =
      (th * 3 + Math.min(bh, 5)) * (1 + Math.log10(pop(t) + 1)) * (1 + Math.log10(dem + 1) / 4) *
      (t.tokens.length > 1 ? 1.3 : 1); // πιο συγκεκριμένα tags προηγούνται
    const s: SuggestedTag = {
      name: t.name,
      existing: true,
      id: t.id,
      path: t.path,
      count: t.count,
      score: Math.round(score * 10) / 10,
      where: [...(th ? ["title" as const] : []), ...(bh ? ["body" as const] : [])],
      demand: dem,
      trending: isTrending(t.tokens),
    };
    // Ένα tag ανά ομάδα διπλοτύπων (κρατάμε το ισχυρότερο).
    const prev = seenGroup.get(t.fuzzy);
    if (!prev || (prev.count ?? 0) < cnt(t)) seenGroup.set(t.fuzzy, s);
  }
  // Αν ταιριάζει και «Μητσοτάκης» και «Κυριάκος Μητσοτάκης», κράτα το πιο συγκεκριμένο.
  let existing = [...seenGroup.values()];
  existing = existing.filter((s) => {
    const broader = existing.find(
      (o) =>
        o !== s &&
        fuzzyTokens(o.name).length > fuzzyTokens(s.name).length &&
        containsPhrase(fuzzyTokens(o.name), fuzzyTokens(s.name)) > 0
    );
    if (!broader) return true;
    // Το ευρύτερο tag «κληρονομεί» τις εμφανίσεις του στενότερου.
    broader.score = Math.round((broader.score + s.score) * 10) / 10;
    broader.where = [...new Set([...broader.where, ...s.where])];
    broader.trending = broader.trending || s.trending;
    return false;
  });
  existing.sort((a, b) => b.score - a.score);
  existing = existing.slice(0, 12);

  // --- Νέα tags: οντότητες του κειμένου που δεν υπάρχουν ως tag ---
  const full = `${title}. ${text}`;
  const fullTok = [...titleTok, ...bodyTok];
  const newMap = new Map<string, SuggestedTag>();
  for (const phrase of properNounPhrases(full).slice(0, 25)) {
    const fk = fuzzyKey(phrase);
    if (fk.length < 3 || ctx.byFuzzy.has(fk)) continue;
    const toks = fuzzyTokens(phrase);
    const th = containsPhrase(titleTok, toks);
    const bh = containsPhrase(bodyTok, toks);
    const dem = phraseDemand(ctx, phrase);
    // Μοιάζει με υπάρχον tag; (π.χ. «Σαμαρά» → υπάρχει «Αντώνης Σαμαράς»)
    const similar = ctx.tags.find((t) => containsPhrase(t.tokens, toks) > 0 && (t.count ?? 3) > 2);
    if (similar && !existing.some((e) => e.id === similar.id)) {
      // Πρότεινε το υπάρχον αντί για νέο.
      existing.push({
        name: similar.name,
        existing: true,
        id: similar.id,
        path: similar.path,
        count: similar.count,
        score: 0.5,
        where: [...(th ? ["title" as const] : []), ...(bh ? ["body" as const] : [])],
        demand: demand.get(similar.id)?.impressions ?? 0,
        trending: isTrending(similar.tokens),
      });
      continue;
    }
    if (similar) continue;
    const score = (th * 3 + Math.min(bh, 5)) * (1 + Math.log10(dem + 1) / 2);
    if (score <= 0) continue;
    newMap.set(fk, {
      name: displayCase(phrase),
      existing: false,
      score: Math.round(score * 10) / 10,
      where: [...(th ? ["title" as const] : []), ...(bh ? ["body" as const] : [])],
      demand: dem,
      trending: isTrending(toks),
    });
  }
  // + όροι με ζήτηση στο GSC που εμφανίζονται στο κείμενο χωρίς να είναι tag
  if (ctx.queries.length) {
    const pnKeys = new Set(properNounPhrases(full).map((p) => fuzzyKey(p)));
    for (const row of computeGapRows(ctx).slice(0, 120)) {
      const toks = fuzzyTokens(row.term);
      const fk = toks.join(" ");
      if (newMap.has(fk)) continue;
      // Μόνες τους οι κοινές λέξεις («κόμμα», «δηλώσεις») δεν είναι tags.
      if (toks.length < 2 && !pnKeys.has(fk)) continue;
      // Ήδη καλύπτεται από ευρύτερο νέο tag («Καμμένος» ⊂ «Πάνος Καμμένος»)
      if ([...newMap.keys()].some((k) => containsPhrase(k.split(" "), toks) > 0)) continue;
      const hits = containsPhrase(fullTok, toks);
      if (!hits || row.term.length < 4) continue;
      newMap.set(fk, {
        name: row.term,
        existing: false,
        score: Math.round(hits * (1 + Math.log10(row.impressions + 1) / 2) * 10) / 10,
        where: [...(containsPhrase(titleTok, toks) ? ["title" as const] : []), "body"],
        demand: row.impressions,
        trending: isTrending(toks),
      });
    }
  }
  const newTags = [...newMap.values()].sort((a, b) => b.demand - a.demand || b.score - a.score).slice(0, 8);

  return { title, existing, newTags, current, sources: ctx.sources, demo: ctx.demo };
}

// ---------------------------- 4. TRENDING ----------------------------

export async function getTrending(): Promise<TrendingData> {
  const ctx = await getContext();
  const sources: SourceStatus = { ...ctx.sources, trends: "ok", errors: { ...ctx.sources.errors } };
  let items: TrendItem[];
  try {
    items = (ctx.demo ? MOCK_TRENDS : await fetchTrends()).map((i) => ({ ...i }));
    if (ctx.demo) sources.trends = "demo";
  } catch (e) {
    items = [];
    sources.trends = "error";
    sources.errors!.trends = errMsg(e);
  }

  for (const it of items) {
    const toks = fuzzyTokens(it.title);
    const exact = ctx.byFuzzy.get(toks.join(" "));
    if (exact?.length) {
      const best = [...exact].sort((a, b) => cnt(b) - cnt(a))[0];
      it.matchedTag = { name: best.name, path: best.path, count: best.count, kind: "exact" };
      continue;
    }
    // Ευρύτερο tag που περιέχει το trend («σαμαρας» → «Αντώνης Σαμαράς»)
    const broader = ctx.tags
      .filter((t) => t.tokens.length > toks.length && containsPhrase(t.tokens, toks) > 0)
      .sort((a, b) => cnt(b) - cnt(a))[0];
    if (broader) {
      it.matchedTag = { name: broader.name, path: broader.path, count: broader.count, kind: "fuzzy" };
      continue;
    }
    // Tag μέσα στο trend («παοκ καλαματα καναλι» → «ΠΑΟΚ»)
    const inside = [...tagsInTokens(ctx, toks).keys()]
      .filter((t) => t.exact.length >= 3)
      .sort((a, b) => b.tokens.length - a.tokens.length || cnt(b) - cnt(a))[0];
    if (inside) {
      it.matchedTag = { name: inside.name, path: inside.path, count: inside.count, kind: "partial" };
    }
  }
  items.sort((a, b) => b.trafficNum - a.trafficNum);
  return { items, sources, demo: ctx.demo, generatedAt: new Date().toISOString() };
}
