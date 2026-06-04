"use client";

// Μικρό sparkline (SVG) για τους ενεργούς χρήστες ανά λεπτό.
export default function Sparkline({
  values,
  height = 70,
}: {
  values: number[];
  height?: number;
}) {
  const w = 100;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 8) - 4;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2ed47a" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#2ed47a" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke="#2ed47a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
