/* Chart primitives, ported from concept-v5.html.

   Every plot is a monotone cubic through real points: no overshoot, no corner,
   no gradient standing in for a line. Grid is a hairline at 7% ink; the fill is
   a 20%→0 wash of the series' own colour. macOS soft, not dashboard sharp. */

import { useId } from "react";

/** Fritsch–Carlson monotone cubic → bezier path. Smooth without wobble. */
export function smooth(pts: Array<[number, number]>): string {
  const n = pts.length;
  if (n < 2) return "";
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    dy.push(pts[i + 1][1] - pts[i][1]);
    m.push(dy[i] / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      t.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);

  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      `C${(pts[i][0] + h).toFixed(2)} ${(pts[i][1] + h * t[i]).toFixed(2)},` +
      `${(pts[i + 1][0] - h).toFixed(2)} ${(pts[i + 1][1] - h * t[i + 1]).toFixed(2)},` +
      `${pts[i + 1][0].toFixed(2)} ${pts[i + 1][1].toFixed(2)}`;
  }
  return d;
}

export const cumulative = (pts: number[]): number[] =>
  pts.reduce<number[]>((acc, v) => (acc.push((acc.at(-1) ?? 0) + v), acc), []);

export const lastN = <T,>(arr: T[], n: number): T[] => arr.slice(-n);

export interface Series {
  label: string;
  color: string;
  pts: number[];
}

export function AreaChart({
  series,
  width = 940,
  height = 190,
  fill = true,
  grid = 4,
  labels = null,
  pad = 10,
}: {
  series: Series[];
  width?: number;
  height?: number;
  fill?: boolean;
  grid?: number;
  labels?: string[] | null;
  pad?: number;
}) {
  const id = useId().replace(/:/g, "");
  const n = series[0]?.pts.length ?? 0;
  if (n < 2) return null;

  const max = Math.max(...series.flatMap((s) => s.pts), 1);
  const px = (i: number) => (i / (n - 1)) * width;
  const py = (v: number) => height - pad - (v / max) * (height - pad * 2);

  return (
    <svg
      className="chart"
      viewBox={`0 -2 ${width} ${height + (labels ? 18 : 4)}`}
      preserveAspectRatio="none"
    >
      <defs>
        {series.map((s, k) => (
          <linearGradient key={k} id={`${id}-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity=".20" />
            <stop offset="1" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {Array.from({ length: grid + 1 }, (_, k) => {
        const y = pad + (k / grid) * (height - pad * 2);
        return <line key={k} className="gl" x1="0" x2={width} y1={y} y2={y} />;
      })}

      {series.map((s, k) => {
        const pts = s.pts.map((v, i) => [px(i), py(v)] as [number, number]);
        const d = smooth(pts);
        const last = pts[pts.length - 1];
        return (
          <g key={k}>
            {fill && k === 0 && (
              <path
                className="cfill"
                d={`${d}L${width} ${height - pad}L0 ${height - pad}Z`}
                fill={`url(#${id}-${k})`}
              />
            )}
            <path className="cl" d={d} stroke={s.color} />
            <circle
              className="cdot"
              cx={last[0].toFixed(1)}
              cy={last[1].toFixed(1)}
              r="3"
              fill={s.color}
            />
          </g>
        );
      })}

      {labels?.map((l, i) => (
        <text
          key={l + i}
          className="xl"
          x={((i / (labels.length - 1)) * width).toFixed(1)}
          y={height + 12}
          textAnchor={
            i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"
          }
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

export function Sparkline({
  pts,
  color,
  width = 190,
  height = 40,
}: {
  pts: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  if (pts.length < 2) return null;

  const max = Math.max(...pts, 1);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const xy = pts.map(
    (p, i) =>
      [
        (i / (pts.length - 1)) * width,
        height - 3 - ((p - min) / span) * (height - 8),
      ] as [number, number],
  );
  const d = smooth(xy);

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${width} ${height}L0 ${height}Z`} fill={`url(#${id})`} />
      <path
        className="sline"
        d={d}
        style={{ ["--ch" as string]: color }}
      />
    </svg>
  );
}

export function BarChart({
  values,
  color,
  width = 300,
  height = 70,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const bw = width / values.length;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {values.map((v, i) => {
        const bh = (v / max) * (height - 4);
        return (
          <rect
            key={i}
            x={(i * bw + bw * 0.18).toFixed(1)}
            y={(height - bh).toFixed(1)}
            width={(bw * 0.64).toFixed(1)}
            height={bh.toFixed(1)}
            rx="2"
            fill={color}
            opacity={(0.32 + 0.55 * (v / max)).toFixed(2)}
          />
        );
      })}
    </svg>
  );
}
