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

export default function MonthlyChart({
  data,
  metric,
  color,
  name,
  partialLast,
}: {
  data: MonthPoint[];
  metric: "pageViews" | "users" | "sessions";
  color: string;
  name: string;
  /** true αν ο τελευταίος μήνας είναι ημιτελής (τρέχων) — τον δείχνουμε ξεθωριασμένο */
  partialLast?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
          formatter={(value: number, _n, item) => {
            const partial =
              partialLast && item?.payload?.ym === data[data.length - 1]?.ym;
            return [
              nf.format(value) + (partial ? " (μερικός μήνας)" : ""),
              name,
            ];
          }}
        />
        <Bar dataKey={metric} radius={[6, 6, 0, 0]} maxBarSize={54}>
          {data.map((d, i) => (
            <Cell
              key={d.ym}
              fill={color}
              fillOpacity={partialLast && i === data.length - 1 ? 0.4 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
