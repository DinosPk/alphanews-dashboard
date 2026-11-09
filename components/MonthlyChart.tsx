"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthPoint } from "@/lib/types";

const nf = new Intl.NumberFormat("el-GR");

function tickFmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}χ`;
  return `${v}`;
}

type Metric = "pageViews" | "users" | "sessions";

export default function MonthlyChart({
  data,
  metric,
  color,
  name,
  partialLast,
}: {
  data: MonthPoint[];
  metric: Metric;
  color: string;
  name: string;
  /** true αν ο τελευταίος μήνας είναι ημιτελής (τρέχων) */
  partialLast?: boolean;
}) {
  // Τρέχων μήνας: πραγματική τιμή (συμπαγής) + υπόλοιπο έως την πρόβλεψη
  // (θαμπό, στοιβαγμένο από πάνω). Το ύψος της στήλης = πρόβλεψη μήνα.
  const rows = data.map((d) => ({
    ...d,
    value: d[metric],
    rest: d.forecast ? Math.max(0, d.forecast[metric] - d[metric]) : 0,
  }));
  const lastYm = data[data.length - 1]?.ym;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2236" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#6b7795", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#232c44" }}
          interval={0}
          minTickGap={0}
        />
        <YAxis
          tick={{ fill: "#6b7795", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={tickFmt}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "#0a0e1a",
            border: "1px solid #232c44",
            borderRadius: 12,
            color: "#eef2fb",
            fontSize: 13,
          }}
          labelStyle={{ color: "#9aa6c2", marginBottom: 4 }}
          itemStyle={{ color: "#eef2fb" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof rows)[number];
            const partial = partialLast && d.ym === lastYm;
            return (
              <div
                style={{
                  background: "#0a0e1a",
                  border: "1px solid #232c44",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "#eef2fb",
                }}
              >
                <div style={{ color: "#9aa6c2", marginBottom: 4 }}>{label}</div>
                <div>
                  {name}: <strong>{nf.format(d.value)}</strong>
                  {partial &&
                    (d.daysElapsed
                      ? ` (${d.daysElapsed}/${d.daysInMonth} ημέρες)`
                      : " (μερικός μήνας)")}
                </div>
                {d.forecast && (
                  <div style={{ color: "#9aa6c2", marginTop: 2 }}>
                    Πρόβλεψη μήνα: <strong style={{ color: "#eef2fb" }}>
                      ~{nf.format(d.forecast[metric])}
                    </strong>
                  </div>
                )}
              </div>
            );
          }}
        />
        <Bar dataKey="value" stackId="m" maxBarSize={54}>
          {rows.map((d) => (
            <Cell
              key={d.ym}
              fill={color}
              fillOpacity={partialLast && d.ym === lastYm && !d.forecast ? 0.4 : 1}
              // Στρογγυλεμένη κορυφή μόνο αν δεν ακολουθεί κομμάτι πρόβλεψης
              radius={(d.rest > 0 ? [0, 0, 0, 0] : [6, 6, 0, 0]) as unknown as number}
            />
          ))}
        </Bar>
        <Bar dataKey="rest" stackId="m" maxBarSize={54} radius={[6, 6, 0, 0]}>
          {rows.map((d) => (
            <Cell
              key={d.ym}
              fill={color}
              fillOpacity={0.22}
              stroke={color}
              strokeOpacity={0.6}
              strokeDasharray="4 3"
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
