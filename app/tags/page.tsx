"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AuditData,
  AuditTag,
  GapData,
  SuggestData,
  SuggestedTag,
  TrendingData,
  SourceStatus,
  TagAction,
} from "@/lib/seo/types";

type Tab = "audit" | "suggest" | "gap" | "trending";

const SITE = "https://www.alphatv.gr";
const nf = new Intl.NumberFormat("el-GR");
const fmt = (n: number | null | undefined) => (n == null ? "—" : nf.format(Math.round(n)));
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

const ACTION_LABEL: Record<TagAction, string> = {
  merge: "Συγχώνευση",
  hub: "Topic hub",
  noindex: "Noindex / διαγραφή",
  "fix-case": "Διόρθωση ΚΕΦΑΛΑΙΩΝ",
  keep: "Εντάξει",
};

// ---------------------------------------------------------------------------

function SourcesBar({ s, demo }: { s?: SourceStatus; demo?: boolean }) {
  if (!s) return null;
  const chip = (label: string, state?: string, err?: string) => {
    if (!state) return null;
    const cls =
      state === "ok"
        ? "ok"
        : state === "sitemap"
        ? "warn"
        : state === "demo"
        ? "demo"
        : state === "not-configured"
        ? "off"
        : "err";
    const txt =
      state === "ok"
        ? "συνδεδεμένο"
        : state === "sitemap"
        ? "μέσω sitemap"
        : state === "demo"
        ? "demo"
        : state === "not-configured"
        ? "δεν έχει ρυθμιστεί"
        : "σφάλμα";
    return (
      <span className={`src-chip ${cls}`} title={err || ""}>
        {label}: {txt}
      </span>
    );
  };
  return (
    <div className="src-bar">
      {chip("WordPress", s.wordpress, s.errors?.wordpress)}
      {chip("Search Console", s.gsc, s.errors?.gsc)}
      {chip("GA4", s.ga4, s.errors?.ga4)}
      {chip("Google Trends", s.trends, s.errors?.trends)}
      {demo && <span className="muted">Το WordPress API δεν απάντησε — εμφανίζονται ενδεικτικά δεδομένα.</span>}
      {!demo && s.wordpress === "sitemap" && (
        <span className="muted">
          Τα tags έρχονται από το δημόσιο sitemap: χωρίς πλήθος άρθρων, ονόματα από τους τίτλους στο GA4.
        </span>
      )}
      {!demo && s.gsc === "not-configured" && (
        <span className="muted">Χωρίς Search Console δεν υπολογίζεται ζήτηση (δες README → SEO tags).</span>
      )}
    </div>
  );
}

function TagLink({ name, path }: { name: string; path?: string }) {
  if (!path) return <>{name}</>;
  return (
    <a href={SITE + path} target="_blank" rel="noreferrer" className="tag-link">
      {name}
    </a>
  );
}

function Loading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="panel">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 18, margin: "10px 0" }} />
      ))}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="panel err-box">⚠️ {msg}</div>;
}

function useFetch<T>(url: string, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [url]);
  useEffect(() => {
    if (enabled && !data && !error) load();
  }, [enabled, data, error, load]);
  return { data, error, reload: () => { setData(null); load(); } };
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------- AUDIT -------------------------------

function AuditView() {
  const { data, error } = useFetch<AuditData>("/api/tags/audit", true);
  const [filter, setFilter] = useState<TagAction | "all">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);

  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLocaleLowerCase("el");
    return data.tags.filter(
      (t) =>
        (filter === "all" || t.action === filter) &&
        (!needle || t.name.toLocaleLowerCase("el").includes(needle) || t.slug.includes(needle))
    );
  }, [data, filter, q]);

  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Loading rows={10} />;

  const counts = data.tags.reduce<Record<string, number>>((acc, t) => {
    acc[t.action] = (acc[t.action] ?? 0) + 1;
    return acc;
  }, {});

  const exportCsv = () =>
    downloadCsv("alphatv-tags-audit.csv", [
      ["id", "tag", "slug", "url", "άρθρα", "τελευταίο άρθρο", "gsc_clicks", "gsc_impressions", "ga4_views", "ζήτηση", "ενέργεια", "συγχώνευση σε", "αιτία"],
      ...list.map((t) => [
        t.id, t.name, t.slug, SITE + t.path, t.count ?? "", t.lastmod?.slice(0, 10) ?? "", t.perf.clicks, t.perf.impressions, t.perf.views,
        t.demand, ACTION_LABEL[t.action], t.mergeInto?.name ?? "", t.reason,
      ]),
    ]);

  return (
    <>
      <SourcesBar s={data.sources} demo={data.demo} />
      <div className="grid kpi-grid">
        <div className="kpi"><div className="label">Tags συνολικά</div><div className="value">{fmt(data.totals.tags)}</div></div>
        <div className="kpi"><div className="label">Ομάδες διπλοτύπων</div><div className="value warn">{fmt(data.totals.duplicateGroups)}</div></div>
        <div className="kpi"><div className="label">Ορφανά (0–1 άρθρο)</div><div className="value warn">{fmt(data.totals.orphans)}</div></div>
        <div className="kpi"><div className="label">{data.totals.orphans === null ? "Ανενεργά (6+ μήνες, χωρίς κίνηση)" : "Thin (2–4, χωρίς κίνηση)"}</div><div className="value">{fmt(data.totals.thin)}</div></div>
        <div className="kpi"><div className="label">Υποψήφια topic hubs</div><div className="value good">{fmt(data.totals.hubs)}</div></div>
      </div>

      {data.duplicates.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>
            🧬 Διπλότυπα tags · {data.totals.duplicateGroups} προς συγχώνευση
            {data.duplicates.length > data.totals.duplicateGroups &&
              ` + ${data.duplicates.length - data.totals.duplicateGroups} σύντομες μορφές`}
          </h3>
          <div className="muted small" style={{ marginBottom: 10 }}>
            <b>Σίγουρα</b>: ίδια λέξη με άλλα κεφαλαία/τόνους. <b>Πιθανά</b>: πτώση, πληθυντικός ή greeklish — θέλουν ματιά πριν τη συγχώνευση. <b>Σύντομη μορφή</b>: π.χ. μόνο επώνυμο δίπλα στο πλήρες όνομα — συνήθως συγχώνευση στο πλήρες.
            Στο WordPress: κράτα το πρώτο, μετέφερε τα άρθρα των υπολοίπων και βάλε 301 από τα παλιά URL.
          </div>
          <div className="dup-list">
            {data.duplicates.slice(0, 60).map((g, i) => (
              <div className="dup-row" key={i}>
                <span className={`tag ${g.kind === "exact" ? "hot" : g.kind === "fuzzy" ? "new" : "up"}`}>
                  {g.kind === "exact" ? "σίγουρο" : g.kind === "fuzzy" ? "πιθανό" : "σύντομη μορφή"}
                </span>
                <span className="dup-canon">
                  <TagLink name={g.canonical.name} path={g.canonical.path} /> {g.canonical.count != null && <span className="muted">({g.canonical.count})</span>}
                </span>
                <span className="muted">←</span>
                <span className="dup-members">
                  {g.members.map((m) => (
                    <span key={m.id} className="pill">
                      <TagLink name={m.name} path={m.path} /> {m.count != null && <span className="muted">({m.count})</span>}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h3 style={{ margin: 0 }}>🏷️ Όλα τα tags · τι να γίνει με το καθένα</h3>
          <div className="controls">
            <input className="input" placeholder="Αναζήτηση tag…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn ghost" onClick={exportCsv}>⬇ CSV</button>
          </div>
        </div>
        <div className="chips">
          {(["all", "merge", "hub", "noindex", "fix-case", "keep"] as const).map((k) => (
            <button key={k} className={`chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
              {k === "all" ? "Όλα" : ACTION_LABEL[k]} <span className="muted">{fmt(k === "all" ? data.tags.length : counts[k] ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tag</th>
                <th className="num">Άρθρα</th>
                <th className="num" title="Τελευταίο άρθρο με αυτό το tag (sitemap)">Τελευταίο</th>
                <th className="num" title="Search Console, 28 ημέρες">Clicks</th>
                <th className="num" title="Search Console, 28 ημέρες">Impr.</th>
                <th className="num" title="GA4, 28 ημέρες">Views</th>
                <th className="num" title="Impressions των queries που περιέχουν το tag">Ζήτηση</th>
                <th>Ενέργεια</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((t: AuditTag) => (
                <tr key={t.id}>
                  <td><TagLink name={t.name} path={t.path} /></td>
                  <td className="num">{fmt(t.count)}</td>
                  <td className="num">{fmtDate(t.lastmod)}</td>
                  <td className="num">{fmt(t.perf.clicks)}</td>
                  <td className="num">{fmt(t.perf.impressions)}</td>
                  <td className="num">{fmt(t.perf.views)}</td>
                  <td className="num">{t.demand ? fmt(t.demand) : "—"}</td>
                  <td>
                    <span className={`act act-${t.action}`}>{ACTION_LABEL[t.action]}</span>
                    <div className="muted small">{t.reason}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length > limit && (
          <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setLimit(limit + 200)}>
            Περισσότερα ({fmt(list.length - limit)} ακόμη)
          </button>
        )}
      </div>
    </>
  );
}

// ------------------------------- SUGGEST -------------------------------

function SuggestCard({ s }: { s: SuggestedTag }) {
  return (
    <div className="sug">
      <div className="sug-name">
        {s.existing ? <TagLink name={s.name} path={s.path} /> : <span>{s.name}</span>}
        {s.trending && <span className="tag hot">🔥 trend</span>}
      </div>
      <div className="muted small">
        {s.existing ? (s.count != null ? `${fmt(s.count)} άρθρα · ` : "υπάρχον tag · ") : "νέο tag · "}
        {s.where.includes("title") ? "στον τίτλο" : "στο κείμενο"}
        {s.demand ? ` · ζήτηση ${fmt(s.demand)}` : ""}
      </div>
    </div>
  );
}

function SuggestView() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SuggestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const r = await fetch("/api/tags/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(url.trim() ? { url: url.trim() } : { title, text }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setRes(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!res) return;
    const names = [...res.existing.slice(0, 6), ...res.newTags.slice(0, 2)].map((s) => s.name);
    await navigator.clipboard.writeText(names.join(", "));
    setCopied(true);
  };

  return (
    <>
      <div className="grid col-2b">
        <div className="panel">
          <h3>✍️ Άρθρο</h3>
          <label className="lbl">URL άρθρου στο alphatv.gr</label>
          <input className="input wide" placeholder="https://www.alphatv.gr/koinonia/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="muted small" style={{ margin: "10px 0" }}>— ή επικόλλησε τίτλο και κείμενο (για άρθρο που δεν έχει δημοσιευτεί) —</div>
          <label className="lbl">Τίτλος</label>
          <input className="input wide" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!!url.trim()} />
          <label className="lbl" style={{ marginTop: 10 }}>Κείμενο</label>
          <textarea className="input wide" rows={10} value={text} onChange={(e) => setText(e.target.value)} disabled={!!url.trim()} />
          <button className="btn" style={{ marginTop: 12 }} onClick={run} disabled={busy || (!url.trim() && !title.trim() && !text.trim())}>
            {busy ? "Ανάλυση…" : "Πρότεινε tags"}
          </button>
          {error && <div className="err-inline">⚠️ {error}</div>}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3 style={{ margin: 0 }}>🏷️ Προτάσεις</h3>
            {res && (
              <button className="btn ghost" onClick={copyAll}>{copied ? "✓ Αντιγράφηκαν" : "Αντιγραφή top tags"}</button>
            )}
          </div>
          {!res && <div className="empty">Δώσε ένα άρθρο για να δεις προτάσεις.</div>}
          {res && (
            <>
              <SourcesBar s={res.sources} demo={res.demo} />
              {res.current && (
                <div className="muted small" style={{ marginBottom: 12 }}>
                  Έχει ήδη: {res.current.length ? res.current.join(", ") : "κανένα tag"}
                </div>
              )}
              <div className="sub-h">Υπάρχοντα tags που ταιριάζουν</div>
              {res.existing.length ? res.existing.map((s, i) => <SuggestCard key={i} s={s} />) : <div className="empty">Κανένα.</div>}
              <div className="sub-h" style={{ marginTop: 16 }}>Νέα tags που αξίζει να δημιουργηθούν</div>
              {res.newTags.length ? res.newTags.map((s, i) => <SuggestCard key={i} s={s} />) : <div className="empty">Κανένα — τα υπάρχοντα καλύπτουν το άρθρο.</div>}
              <div className="muted small" style={{ marginTop: 14 }}>
                Κανόνας: 3–6 tags ανά άρθρο, πάντα πρόσωπα/οργανισμοί/τόποι του θέματος. Νέο tag μόνο αν θα ξαναχρησιμοποιηθεί.
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ------------------------------- GAP -------------------------------

function GapView() {
  const { data, error } = useFetch<GapData>("/api/tags/gap", true);
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Loading rows={10} />;
  const noGsc = !data.demo && data.sources.gsc !== "ok";

  return (
    <>
      <SourcesBar s={data.sources} demo={data.demo} />
      {noGsc ? (
        <ErrorBox msg={data.sources.errors?.gsc || "Το Search Console δεν έχει ρυθμιστεί — η ανάλυση ζήτησης χρειάζεται τα queries του GSC."} />
      ) : (
        <div className="grid col-2b">
          <div className="panel">
            <div className="panel-head">
              <h3 style={{ margin: 0 }}>🕳️ Ζήτηση χωρίς tag</h3>
              <button
                className="btn ghost"
                onClick={() =>
                  downloadCsv("alphatv-tag-gap.csv", [
                    ["όρος", "impressions", "clicks", "queries", "παραδείγματα"],
                    ...data.rows.map((r) => [r.term, r.impressions, r.clicks, r.queries, r.examples.join(" | ")]),
                  ])
                }
              >
                ⬇ CSV
              </button>
            </div>
            <div className="muted small" style={{ marginBottom: 10 }}>
              Όροι από τα queries του Google ({data.period.start} → {data.period.end}) για τους οποίους δεν υπάρχει tag (ούτε ως κομμάτι ευρύτερου tag). Υποψήφια νέα tags ή topic hubs. Τα brand queries (alpha, alphatv) εξαιρούνται.
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Όρος</th>
                    <th className="num">Impr.</th>
                    <th className="num">Clicks</th>
                    <th className="num">Queries</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <b>{r.term}</b>
                        <div className="muted small">{r.examples.join(" · ")}</div>
                      </td>
                      <td className="num">{fmt(r.impressions)}</td>
                      <td className="num">{fmt(r.clicks)}</td>
                      <td className="num">{fmt(r.queries)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <h3>🏛️ Tags με τη μεγαλύτερη ζήτηση</h3>
            <div className="muted small" style={{ marginBottom: 10 }}>Οι πρώτοι υποψήφιοι για topic hub σελίδες.</div>
            <div className="list">
              {data.topTags.map((t, i) => (
                <div className="list-row" key={i}>
                  <span className="rank">{i + 1}</span>
                  <span className="list-title"><TagLink name={t.name} path={t.path} /> {t.count != null && <span className="muted">({t.count})</span>}</span>
                  <span className="list-val">{fmt(t.demand)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------- TRENDING -------------------------------

function TrendingView() {
  const { data, error, reload } = useFetch<TrendingData>("/api/tags/trending", true);
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Loading rows={8} />;
  const missing = data.items.filter((i) => !i.matchedTag).length;

  return (
    <>
      <SourcesBar s={data.sources} demo={data.demo} />
      <div className="panel">
        <div className="panel-head">
          <h3 style={{ margin: 0 }}>📈 Google Trends Ελλάδα · τώρα</h3>
          <button className="btn ghost" onClick={reload}>↻ Ανανέωση</button>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>
          {missing} από {data.items.length} θέματα δεν έχουν tag στο site. Αν τα καλύπτουμε, φτιάξε το tag τώρα — η σελίδα tag μαζεύει την αναζήτηση όσο κρατάει το θέμα.
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Αναζήτηση</th>
                <th className="num">Όγκος</th>
                <th>Tag στο alphatv.gr</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <b>{it.title}</b>
                    {it.news[0] && (
                      <div className="muted small">
                        <a href={it.news[0].url} target="_blank" rel="noreferrer" className="tag-link dim">{it.news[0].title}</a> · {it.news[0].source}
                      </div>
                    )}
                  </td>
                  <td className="num">{it.traffic}</td>
                  <td>
                    {it.matchedTag ? (
                      <>
                        <TagLink name={it.matchedTag.name} path={it.matchedTag.path} />{" "}
                        <span className="muted small">
                          ({it.matchedTag.count != null ? `${it.matchedTag.count} άρθρα` : "υπάρχει"}
                          {it.matchedTag.kind === "partial" ? ", μερική αντιστοίχιση" : it.matchedTag.kind === "fuzzy" ? ", ευρύτερο tag" : ""})
                        </span>
                      </>
                    ) : (
                      <span className="act act-merge">Χωρίς tag</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ------------------------------- PAGE -------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: "audit", label: "Audit tags" },
  { key: "suggest", label: "Πρόταση tags" },
  { key: "gap", label: "Ζήτηση χωρίς tag" },
  { key: "trending", label: "Trends τώρα" },
];

export default function TagsPage() {
  const [tab, setTab] = useState<Tab>("audit");
  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <div>
            <div className="logo">
              <span className="a">alphanews</span>
              <span className="dot">.</span>
            </div>
            <div className="brand-sub">SEO Tags · Audit, προτάσεις & ζήτηση</div>
          </div>
        </div>
        <div className="header-right">
          <Link href="/" className="btn ghost">← Dashboard</Link>
        </div>
      </div>

      <div className="view-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`view-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "audit" && <AuditView />}
      {tab === "suggest" && <SuggestView />}
      {tab === "gap" && <GapView />}
      {tab === "trending" && <TrendingView />}

      <div className="footer">
        <span>Πηγές: WordPress REST API · Google Search Console (28 ημ.) · GA4 (28 ημ.) · Google Trends RSS (GR)</span>
      </div>
    </div>
  );
}
