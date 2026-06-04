"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RealtimeData,
  HistoricalData,
  RangeKey,
  KpiValue,
} from "@/lib/types";
import { SECTIONS } from "@/lib/sections";
import TrendChart from "@/components/TrendChart";

const nf = new Intl.NumberFormat("el-GR");
const fmt = (n: number) => nf.format(Math.round(n));

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "24h", label: "24ωρο" },
  { key: "7d", label: "Εβδομάδα" },
  { key: "30d", label: "Μήνας" },
];

const RANGE_NOTE: Record<RangeKey, string> = {
  "24h": "τελευταίες 24 ώρες vs προηγούμενες 24",
  "7d": "7 ολοκληρωμένες ημέρες (έως χθες) vs προηγούμενες 7",
  "30d": "30 ολοκληρωμένες ημέρες (έως χθες) vs προηγούμενες 30",
};

function secsToMin(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function Delta({ kpi }: { kpi: KpiValue }) {
  if (kpi.changePct === null) {
    return <span className="delta flat">—</span>;
  }
  const up = kpi.changePct >= 0;
  const cls = Math.abs(kpi.changePct) < 0.5 ? "flat" : up ? "up" : "down";
  const arrow = cls === "flat" ? "→" : up ? "▲" : "▼";
  return (
    <span className={`delta ${cls}`}>
      {arrow} {Math.abs(kpi.changePct).toFixed(1)}%
    </span>
  );
}

function Kpi({
  label,
  kpi,
  format,
}: {
  label: string;
  kpi: KpiValue;
  format?: (n: number) => string;
}) {
  const f = format ?? fmt;
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{f(kpi.current)}</div>
      <div>
        <Delta kpi={kpi} />
        <span className="compare">από {f(kpi.previous)}</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [rt, setRt] = useState<RealtimeData | null>(null);
  const [hist, setHist] = useState<HistoricalData | null>(null);
  const [range, setRange] = useState<RangeKey>("24h");
  const [section, setSection] = useState<string>("all");
  const [now, setNow] = useState("");

  // --- Ανίχνευση άρθρων που «απογειώνονται» (spike) ---
  const prevPagesRef = useRef<Map<string, number>>(new Map());
  const [trends, setTrends] = useState<
    Record<string, { delta: number; hot: boolean; isNew: boolean }>
  >({});

  const loadRealtime = useCallback(async () => {
    try {
      const res = await fetch("/api/realtime", { cache: "no-store" });
      setRt(await res.json());
    } catch {
      /* αγνόησε προσωρινό σφάλμα δικτύου */
    }
  }, []);

  const loadHistorical = useCallback(async (r: RangeKey, s: string) => {
    try {
      const res = await fetch(`/api/historical?range=${r}&section=${s}`, {
        cache: "no-store",
      });
      setHist(await res.json());
    } catch {
      /* αγνόησε */
    }
  }, []);

  // Real-time: φόρτωση + ανανέωση κάθε 15"
  useEffect(() => {
    loadRealtime();
    // 30s: εξοικονόμηση realtime quota του GA4
    const id = setInterval(loadRealtime, 30000);
    return () => clearInterval(id);
  }, [loadRealtime]);

  // Ιστορικά: όποτε αλλάζει το εύρος ή η ενότητα
  useEffect(() => {
    setHist(null);
    loadHistorical(range, section);
  }, [range, section, loadHistorical]);

  // Υπολογισμός μεταβολής ανά άρθρο σε σχέση με την προηγούμενη ανανέωση
  useEffect(() => {
    if (!rt) return;
    const prev = prevPagesRef.current;
    const next: Record<
      string,
      { delta: number; hot: boolean; isNew: boolean }
    > = {};
    for (const p of rt.topPages) {
      if (prev.has(p.title)) {
        const base = prev.get(p.title) || 1;
        const delta = p.value - base;
        const hot = delta >= 20 || (delta >= 8 && delta / base >= 0.5);
        next[p.title] = { delta, hot, isNew: false };
      } else {
        next[p.title] = { delta: 0, hot: false, isNew: prev.size > 0 };
      }
    }
    setTrends(next);
    prevPagesRef.current = new Map(rt.topPages.map((p) => [p.title, p.value]));
  }, [rt]);

  // Ρολόι
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("el-GR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const isDemo = rt?.demo || hist?.demo;
  const maxDevice = Math.max(...(rt?.byDevice.map((d) => d.users) ?? [1]), 1);

  // Το πιο «καυτό» άρθρο αυτή τη στιγμή (για το banner ειδοποίησης)
  const hottest = rt?.topPages
    .map((p) => ({ p, t: trends[p.title] }))
    .filter((x) => x.t?.hot)
    .sort((a, b) => (b.t?.delta ?? 0) - (a.t?.delta ?? 0))[0];

  return (
    <div className="wrap">
      {/* ---------- Header ---------- */}
      <div className="topbar">
        <div className="brand">
          <div>
            <div className="logo">
              <span className="a">alphanews</span>
              <span className="dot">.</span>
            </div>
            <div className="brand-sub">Newsroom Dashboard · Αρχισυνταξία</div>
          </div>
        </div>
        <div className="header-right">
          {isDemo && (
            <span className="demo-badge">DEMO — χωρίς σύνδεση GA4</span>
          )}
          <span className="live-badge">
            <span className="pulse" />
            LIVE
          </span>
          <span className="clock">🕐 {now}</span>
        </div>
      </div>

      {/* ---------- ΕΙΔΗΣΕΙΣ ΣΗΜΕΡΑ (live) ---------- */}
      <div className="section-title live">
        <span className="bar" />
        Ειδήσεις σήμερα · ζωντανή εικόνα
      </div>

      {hottest && (
        <div className="alert">
          <span className="alert-icon">🔥</span>
          <span className="alert-text">
            <strong>{hottest.p.title}</strong> απογειώνεται —{" "}
            <span className="alert-num">+{fmt(hottest.t!.delta)}</span> προβολές
            από την προηγούμενη ανανέωση
          </span>
        </div>
      )}

      <div className="grid col-2">

        <div className="panel">
          <h3>📰 Top ειδήσεις · τελευταία ώρα</h3>
          <div className="list">
            {rt?.topPages.length ? (
              rt.topPages.map((p, i) => {
                const t = trends[p.title];
                return (
                  <div className="list-row" key={i}>
                    <span className="rank">{i + 1}</span>
                    <span className="list-title" title={p.title}>
                      {p.title}
                    </span>
                    {t?.hot ? (
                      <span className="tag hot">🔥 +{fmt(t.delta)}</span>
                    ) : t?.isNew ? (
                      <span className="tag new">νέο</span>
                    ) : t && t.delta > 0 ? (
                      <span className="tag up">▲ {fmt(t.delta)}</span>
                    ) : t && t.delta < 0 ? (
                      <span className="tag down">▼ {fmt(Math.abs(t.delta))}</span>
                    ) : null}
                    <span className="list-val">{fmt(p.value)}</span>
                  </div>
                );
              })
            ) : (
              <div className="empty">Δεν υπάρχουν προβολές ειδήσεων την τελευταία ώρα.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <h3>📱 Ανά συσκευή</h3>
          <div className="bars" style={{ marginBottom: 22 }}>
            {rt?.byDevice.map((d, i) => (
              <div className="bar-row" key={i}>
                <div className="bar-head">
                  <span>{d.device}</span>
                  <span className="muted">{fmt(d.users)}</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(d.users / maxDevice) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <h3>🌍 Top χώρες</h3>
          <div className="list">
            {rt?.byCountry.slice(0, 4).map((c, i) => (
              <div className="list-row" key={i}>
                <span className="list-title">{c.country}</span>
                <span className="list-val">{fmt(c.users)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- HISTORICAL ---------- */}
      <div
        className="section-title"
        style={{ justifyContent: "space-between" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="bar" />
          Ιστορικά στοιχεία
        </span>
        <div className="controls">
          <select
            className="select"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            aria-label="Ενότητα"
          >
            <option value="all">Όλες οι ενότητες</option>
            {SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="tabs">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className={`tab ${range === r.key ? "active" : ""}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid kpi-grid">
        {hist ? (
          <>
            <Kpi label="Προβολές σελίδων" kpi={hist.kpis.pageViews} />
            <Kpi label="Ενεργοί χρήστες" kpi={hist.kpis.activeUsers} />
            <Kpi label="Συνεδρίες" kpi={hist.kpis.sessions} />
            <Kpi
              label="Μέση διάρκεια"
              kpi={hist.kpis.avgSessionDuration}
              format={secsToMin}
            />
            <Kpi
              label="Engagement"
              kpi={hist.kpis.engagementRate}
              format={(n) => `${n.toFixed(0)}%`}
            />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => (
            <div className="kpi" key={i}>
              <div className="skeleton" style={{ height: 12, width: "60%" }} />
              <div
                className="skeleton"
                style={{ height: 30, width: "80%", margin: "10px 0" }}
              />
              <div className="skeleton" style={{ height: 14, width: "45%" }} />
            </div>
          ))
        )}
      </div>
      <div className="muted" style={{ fontSize: 12, margin: "10px 2px 0" }}>
        Σύγκριση: {RANGE_NOTE[range]}
      </div>

      {/* Trend + channels */}
      <div className="grid col-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>📈 Τάση επισκεψιμότητας</h3>
          {hist ? (
            <TrendChart data={hist.timeseries} />
          ) : (
            <div className="skeleton" style={{ height: 300 }} />
          )}
          <div
            style={{
              display: "flex",
              gap: 20,
              marginTop: 10,
              fontSize: 12.5,
            }}
          >
            <span style={{ color: "var(--accent)" }}>● Προβολές</span>
            <span style={{ color: "var(--blue)" }}>● Χρήστες</span>
            <span style={{ color: "#7c89a8" }}>┄ Προηγ. περίοδος</span>
          </div>
        </div>

        <div className="panel">
          <h3>🔗 Πηγές επισκεψιμότητας</h3>
          <div className="bars">
            {hist?.channels.map((c, i) => (
              <div className="bar-row" key={i}>
                <div className="bar-head">
                  <span>{c.channel}</span>
                  <span className="muted">
                    {fmt(c.sessions)} · {c.share.toFixed(0)}%
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill alt"
                    style={{ width: `${c.share}%` }}
                  />
                </div>
              </div>
            ))}
            {!hist && <div className="skeleton" style={{ height: 180 }} />}
          </div>
        </div>
      </div>

      {/* Top articles */}
      <div className="grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>🏆 Top άρθρα · {RANGES.find((r) => r.key === range)?.label}</h3>
          <div className="list">
            {hist?.topArticles.map((a, i) => (
              <div className="list-row" key={i}>
                <span className="rank">{i + 1}</span>
                <span className="list-title" title={a.path || a.title}>
                  {a.title}
                </span>
                <span className="list-val">{fmt(a.value)}</span>
              </div>
            ))}
            {!hist && <div className="skeleton" style={{ height: 200 }} />}
          </div>
        </div>
      </div>

      <div className="footer">
        <span>
          Πηγή: Google Analytics 4{isDemo ? " (demo δεδομένα)" : ""} · Ανανέωση
          real-time κάθε 15″
        </span>
        <span>
          {rt
            ? `Τελευταία ενημέρωση: ${new Date(
                rt.generatedAt
              ).toLocaleTimeString("el-GR")}`
            : ""}
        </span>
      </div>
    </div>
  );
}
