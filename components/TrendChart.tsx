"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TimePoint } from "@/lib/types";

const fmt = new Intl.NumberFormat("el-GR");

export default function TrendChart({ data }: { data: TimePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gPV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e4002b" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#e4002b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d7dff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3d7dff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2236" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#6b7795", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#232c44" }}
          minTickGap={16}
        />
        <YAxis
          tick={{ fill: "#6b7795", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}χ` : `${v}`)}
        />
        <Tooltip
          contentStyle={{
            background: "#0a0e1a",
            border: "1px solid #232c44",
            borderRadius: 12,
            color: "#eef2fb",
            fontSize: 13,
          }}
          labelStyle={{ color: "#9aa6c2", marginBottom: 4 }}
          formatter={(value: number, name: string) => [
            fmt.format(value),
            name === "pageViews"
              ? "Προβολές"
              : name === "prevPageViews"
                ? "Προβολές (προηγ. περίοδος)"
                : "Χρήστες",
          ]}
        />
        {/* Προηγούμενη περίοδος — διακεκομμένη, σβησμένη */}
        <Area
          type="monotone"
          dataKey="prevPageViews"
          stroke="#7c89a8"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          fill="none"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="pageViews"
          stroke="#e4002b"
          strokeWidth={2}
          fill="url(#gPV)"
        />
        <Area
          type="monotone"
          dataKey="users"
          stroke="#3d7dff"
          strokeWidth={2}
          fill="url(#gU)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
